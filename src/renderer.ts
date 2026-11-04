import type { AgentInfo, Answer, CommandResult, ModelRef, PendingQuestion, Thinking } from './bridge/protocol.ts';
import type { OfficeApi, OfficeUpdate } from './preload.ts';
import { createScene } from './office/scene.ts';
import { COATS, Painter } from './office/sprites.ts';
import {
  BREEDS, DEFAULT_APPEARANCE, DEFAULT_HUMAN, DEFAULT_ROBOT_COLORS,
  HUMAN_GENDERS, HUMAN_HAIR_COLORS, HUMAN_HAIR_STYLES, HUMAN_SKINS, OUTFITS, ROBOT_COLORS,
  type Appearance, type Breed, type HumanGender, type HumanHairColor, type HumanHairStyle, type HumanSkin, type Outfit, type RobotColor,
} from './office/appearance.ts';
import { agentKey, createOffice, isWorking, syncOffice, type Actor, type Project } from './state.ts';
import { actorName, catNameKey, moleActor, projectName, type OfficeNames } from './office/names.ts';

declare global { interface Window { office: OfficeApi } }
const office = window.office;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const state = createOffice();
let appearance: Appearance = DEFAULT_APPEARANCE, draft: Appearance = DEFAULT_APPEARANCE;
let inventoryComplete = true;
const logo = new Image(); logo.src = 'nter-logo.png';
const bell = new Audio('notification.wav');
let agents: AgentInfo[] = [], muted = false, selected: string | null = null;
let selectedProject: string | null = null;
let names: OfficeNames = { cats: {}, projects: {} }, projectMembersKey = '', usageLoading = false;
const heard = new Set<string>(), briefings: string[] = [];
const receivedMessages = new Map<string, number>(), deferredZaps: string[] = [];
let appearanceReady = false;
let questionFormKey: string | null = null, cardDisabled = false;
const answerLocked = new Set<string>(), answerInFlight = new Set<string>();
const PHASES: Omit<Record<AgentInfo['phase'], string>, 'asking-parent'> = {
  working: 'Trabajando', idle: 'Libre', 'waiting-human': 'Necesita tu decisión', stopped: 'Detenido', unknown: 'Sin conectar',
};
function activeTheme() { return ($('setup').hidden ? appearance.theme : draft.theme) ?? 'robots'; }
function phaseName(phase: AgentInfo['phase']) {
  return phase === 'asking-parent' ? activeTheme() === 'robots' ? 'Consultando a su agente' : 'Consultando a su gato' : PHASES[phase];
}
function renderStatus() {
  const projects = new Set(agents.map(agent => agent.cwd.toLowerCase())).size;
  const roots = agents.filter(agent => !agent.parent).length;
  const robots = activeTheme() === 'robots';
  $('status').textContent = `${projects} proyectos · ${roots} ${robots ? 'agentes robot' : 'agentes'} · ${agents.length - roots} ${robots ? 'subagentes robot' : 'ratones'}` +
    (inventoryComplete ? '' : ' · inventario incompleto');
}
function renderWorkload() {
  const working = agents.filter(isWorking).length;
  $('boss-workload').textContent = `${working} ${activeTheme() === 'robots' ? 'agentes robot y subagentes robot' : 'agentes y subagentes'} trabajando · ${working === 0 ? 'Sin estrés' : working < 4 ? 'Carga baja' : working < 8 ? 'Carga alta' : 'Estrés máximo'}`;
}
function updateThemeText() {
  const robots = activeTheme() === 'robots';
  $('agent-name-label').textContent = robots ? 'Nombre del agente robot' : 'Nombre del gato';
  $('project-members-title').textContent = robots ? 'Agentes robot asignados' : 'Agentes asignados';
  renderStatus(); renderWorkload();
  const actor = selected ? state.actors.get(selected) : undefined;
  if (actor) fillCard(actor);
  const project = selectedProject ? state.projects.get(selectedProject) : undefined;
  if (project) fillProject(project);
}

const scene = createScene($('office'), logo, {
  onSelect: actor => openCard(actor),
  onProject: project => openProject(project),
  onBoss: () => { void openBoss(); },
  onBriefing: () => { void openHistory(); acknowledgeBriefings(); },
});
function acknowledgeBriefings() {
  for (const id of briefings.splice(0)) void office.acknowledgeBriefing(id);
  scene.dismissBriefing(); renderNotices();
}
function showMessageZap(id: string) {
  if (appearanceReady) scene.zap(id); else deferredZaps.push(id);
}
function apply(update: OfficeUpdate) {
  agents = update.agents;
  inventoryComplete = update.complete;
  syncOffice(state, agents, update.complete);
  scene.update(state);
  const live = new Set<string>();
  for (const info of agents) {
    const id = agentKey(info.ref), count = info.receivedMessages;
    live.add(id);
    if (count === undefined) continue;
    const previous = receivedMessages.get(id);
    const fresh = info.lastMessageAt !== undefined && Date.now() - info.lastMessageAt >= 0 && Date.now() - info.lastMessageAt < 5000;
    const received = previous === undefined ? (count > 0 && fresh ? 1 : 0) : Math.max(0, count - previous);
    receivedMessages.set(id, count);
    for (let i = 0; i < received; i++) showMessageZap(id);
  }
  if (update.complete) for (const id of receivedMessages.keys()) if (!live.has(id)) receivedMessages.delete(id);
  renderWorkload();
  if (selectedProject) {
    const project = state.projects.get(selectedProject);
    if (project) fillProject(project);
    else { $('project').hidden = true; selectedProject = null; }
  }
  renderStatus();
  const waiting = agents.filter(agent => agent.phase === 'waiting-human');
  for (const agent of waiting) {
    const id = agentKey(agent.ref);
    if (!heard.has(id)) { heard.add(id); if (!muted) { bell.currentTime = 0; void bell.play().catch(() => undefined); } }
  }
  for (const id of heard) if (!waiting.some(agent => agentKey(agent.ref) === id)) heard.delete(id);
  renderNotices();
  if (selected) {
    const actor = state.actors.get(selected);
    if (actor && !actor.departing) fillCard(actor); else {
      $('card-result').textContent = 'Este agente ha terminado su sesión.';
      $('card-result').classList.remove('error');
      $('card-questions').replaceChildren(); $('card-questions').hidden = true;
      $<HTMLTextAreaElement>('card-message').value = ''; $('card-message-block').hidden = false;
      if (questionFormKey && !answerInFlight.has(questionFormKey)) answerLocked.delete(questionFormKey);
      questionFormKey = null;
      disableCard(true);
    }
  }
}
const noticeButtons = new Map<string, { button: HTMLButtonElement; action: HTMLSpanElement; detail: HTMLElement; requestId: string | null }>();
let briefingButton: HTMLButtonElement | null = null;
// Inventory refreshes every second: keep existing notices so click results and animations survive.
function renderNotices() {
  const root = $('notices'), waiting = agents.filter(item => item.phase === 'waiting-human');
  const live = new Set(waiting.map(agent => agentKey(agent.ref)));
  for (const [id, notice] of noticeButtons) if (!live.has(id)) { notice.button.remove(); noticeButtons.delete(id); }
  for (const agent of waiting) {
    const id = agentKey(agent.ref);
    let notice = noticeButtons.get(id);
    if (!notice) {
      const button = document.createElement('button'), action = document.createElement('span'), detail = document.createElement('small');
      button.className = 'notice new';
      button.append(action, detail);
      notice = { button, action, detail, requestId: null };
      notice.button.onclick = async () => {
        const actor = state.actors.get(id);
        if (actor?.info.question?.questions.length) { void openCard(actor); return; }
        if (!actor) { notice!.detail.textContent = 'Esta sesión ya no está abierta.'; return; }
        notice!.button.disabled = true;
        const result = await office.focusSession(actor.info.ref).catch(error => ({ ok: false as const, message: String(error) }));
        notice!.detail.textContent = result.ok ? 'Consola abierta: responde allí.' : result.message;
        notice!.button.disabled = false;
      };
      noticeButtons.set(id, notice);
      root.prepend(button);
    }
    const request = pendingQuestion(agent);
    const requestId = request?.requestId ?? '';
    notice.action.textContent = request
      ? '! Necesito tu decisión · Responder aquí'
      : '! Necesito tu decisión · Abrir consola';
    if (notice.requestId !== requestId) {
      notice.requestId = requestId;
      notice.detail.textContent = `${agent.name} · ${agent.conversation?.project ?? agent.cwd}` +
        (request ? ` · ${request.questions.length} ${request.questions.length === 1 ? 'pregunta' : 'preguntas'}` : '');
    }
  }
  if (briefings.length && !briefingButton) {
    briefingButton = document.createElement('button');
    briefingButton.className = 'notice briefing';
    briefingButton.textContent = '✉ Conversaciones de los últimos 7 días';
    briefingButton.onclick = () => { void openHistory(); acknowledgeBriefings(); };
    root.append(briefingButton);
  } else if (!briefings.length && briefingButton) { briefingButton.remove(); briefingButton = null; }
}

function pendingQuestion(info: AgentInfo | undefined): PendingQuestion | null {
  return info?.question?.questions.length ? info.question : null;
}
const answerKey = (actorId: string, requestId: string) => `${actorId}\0${requestId}`;
function appendEmphasis(element: HTMLElement, text: string) {
  const pattern = /\*\*(\S(?:[^\n]*?\S)?)\*\*/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(offset, match.index)));
    const strong = document.createElement('strong');
    strong.textContent = match[1]!;
    element.append(strong);
    offset = match.index! + match[0].length;
  }
  element.append(document.createTextNode(text.slice(offset)));
}
function questionGroup(question: PendingQuestion['questions'][number], index: number, includeCustom: boolean): HTMLFieldSetElement {
  const field = document.createElement('fieldset');
  field.className = 'question-group'; field.dataset.questionId = question.id;
  const legend = document.createElement('legend');
  appendEmphasis(legend, question.header || `Pregunta ${index + 1}`);
  field.append(legend);
  const prompt = document.createElement('p');
  prompt.className = 'question-prompt'; appendEmphasis(prompt, question.question); field.append(prompt);
  question.options.forEach((option, optionIndex) => {
    const label = document.createElement('label'), input = document.createElement('input'), copy = document.createElement('span');
    label.className = 'question-option';
    input.type = question.multi ? 'checkbox' : 'radio'; input.name = `question-${index}`; input.value = option.label;
    copy.className = 'question-option-copy';
    const title = document.createElement('span'); title.className = 'question-option-title'; appendEmphasis(title, option.label);
    copy.append(title);
    if (question.recommended === optionIndex) {
      const badge = document.createElement('span'); badge.className = 'question-recommended'; badge.textContent = 'Recomendada'; title.append(badge);
    }
    if (option.description) {
      const description = document.createElement('span'); description.className = 'question-description';
      appendEmphasis(description, option.description); copy.append(description);
    }
    if (option.preview) {
      const preview = document.createElement('pre'); preview.className = 'question-preview';
      preview.textContent = option.preview; copy.append(preview);
    }
    label.append(input, copy); field.append(label);
  });
  if (includeCustom) {
    const label = document.createElement('label'), caption = document.createElement('span'), input = document.createElement('textarea');
    label.className = 'question-custom-label'; caption.textContent = 'Respuesta personalizada (opcional)';
    input.className = 'question-custom'; input.rows = 2; input.maxLength = 131072;
    label.append(caption, input); field.append(label);
  }
  return field;
}
function renderQuestionForm(actor: Actor) {
  const request = pendingQuestion(actor.info), key = answerKey(actor.id, request?.requestId ?? '');
  if (questionFormKey === key) { syncQuestionControls(); return; }
  if (questionFormKey && answerLocked.has(questionFormKey) && !answerInFlight.has(questionFormKey)) answerLocked.delete(questionFormKey);
  questionFormKey = key;
  const form = $<HTMLFormElement>('card-questions');
  form.replaceChildren(); form.hidden = !request;
  $<HTMLTextAreaElement>('card-message').value = '';
  $('card-result').textContent = ''; $('card-result').classList.remove('error');
  if (request) {
    if (request.questions.length > 1) {
      const guidance = document.createElement('p');
      guidance.className = 'hint'; guidance.textContent = 'Responde cada pregunta aquí para completar esta solicitud.';
      form.append(guidance);
      request.questions.forEach((question, index) => form.append(questionGroup(question, index, true)));
      const submit = document.createElement('button');
      submit.className = 'question-submit primary'; submit.type = 'submit'; submit.textContent = 'Enviar respuestas';
      form.append(submit);
    } else {
      request.questions.forEach((question, index) => form.append(questionGroup(question, index, false)));
    }
  }
  syncQuestionControls();
}
function syncQuestionControls() {
  const info = selected ? state.actors.get(selected)?.info : undefined, request = pendingQuestion(info);
  const single = request?.questions.length === 1, batch = !!request && request.questions.length > 1;
  const locked = !!(selected && request && answerLocked.has(answerKey(selected, request.requestId)));
  $('card-message-block').hidden = batch;
  $('card-message-label').textContent = single ? 'Respuesta personalizada (opcional)' : 'Mensaje para este agente';
  const message = $<HTMLTextAreaElement>('card-message');
  message.placeholder = single ? 'Escribe una respuesta personalizada si ninguna opción basta' : '';
  message.disabled = cardDisabled || batch || locked;
  const steer = $<HTMLButtonElement>('card-steer'), follow = $<HTMLButtonElement>('card-follow');
  steer.textContent = single ? 'Responder' : batch ? 'Usa las preguntas' : 'Enviar ahora';
  steer.disabled = cardDisabled || batch || (single && locked);
  follow.textContent = batch ? 'Usa las preguntas' : 'Al terminar';
  follow.disabled = cardDisabled || batch || single || locked;
  follow.hidden = !!single;
  const form = $<HTMLFormElement>('card-questions');
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, button')) {
    control.disabled = cardDisabled || locked;
  }
}

function disableCard(disabled: boolean) {
  cardDisabled = disabled;
  for (const id of ['card-model', 'card-thinking', 'card-model-confirm']) ($(id) as HTMLButtonElement).disabled = disabled;
  syncQuestionControls();
}
function fillCard(actor: Actor) {
  const info = actor.info;
  const isMole = !info.parent && activeTheme() === 'animals' && actor === moleActor(state.actors.values(), names);
  $('agent-name-label').textContent = activeTheme() === 'robots' ? 'Nombre del agente robot' : isMole ? 'Nombre del topo' : 'Nombre del gato';
  $('card-name').textContent = info.parent ? info.name : actorName(actor, names) + (info.connected === false ? '' : ' · ' + info.name);
  $('card-role').textContent = activeTheme() === 'robots'
    ? info.parent ? 'Subagente robot' : 'Agente robot'
    : info.parent ? 'Subagente (rata)' : isMole ? 'Agente (topo)' : 'Agente (gato)';
  const project = state.projects.get(actor.project);
  $('card-project').textContent = (project ? projectName(project, names) : info.conversation?.project ?? info.cwd) + ' · ' + info.cwd;
  $('card-session').textContent = info.ref.sessionId;
  $('card-phase').textContent = phaseName(info.phase);
  $('card-activity').textContent = info.activity || '—';
  $('card-activity-note').textContent = info.connected !== false && info.activityKind === undefined
    ? 'Para ver las acciones, reinicia esta consola de omp cuando termine su trabajo y cargará el puente actualizado.' : '';
  renderQuestionForm(actor);
}
async function openCard(actor: Actor) {
  $('project').hidden = true; selectedProject = null;
  $('boss').hidden = true; $('setup').hidden = true;
  $('cat-name-form').hidden = !!actor.info.parent;
  $<HTMLInputElement>('cat-name-input').value = names.cats[catNameKey(actor.info)] ?? '';
  $('cat-name-result').textContent = '';
  selected = actor.id;
  const info = actor.info, select = $<HTMLSelectElement>('card-model');
  $('card-result').textContent = ''; $('card-result').classList.remove('error');
  fillCard(actor); disableCard(false);
  $('card').hidden = false; $('history').hidden = true;
  select.replaceChildren(); $<HTMLSelectElement>('card-thinking').replaceChildren();
  $<HTMLButtonElement>('card-model-confirm').disabled = true;
  if (info.connected === false) {
    disableCard(true);
    $('card-model-status').textContent = 'Esta consola se abrió antes de conectar la oficina. Reiníciala (o abre una nueva) para ver su estado y controlarla desde aquí.';
    return;
  }
  $('card-model-status').textContent = 'Cargando modelos…';
  const result = await office.send({ id: crypto.randomUUID(), type: 'models', ref: info.ref }).catch(error => failure(error));
  if (selected !== actor.id) return;
  if (!result.ok) { $('card-model-status').textContent = result.message; return; }
  for (const model of result.models ?? []) {
    const option = document.createElement('option');
    option.value = JSON.stringify(model); option.textContent = `${model.name} (${model.provider})`;
    option.selected = info.model?.provider === model.provider && info.model.id === model.id;
    select.append(option);
  }
  fillThinking(info.model?.efforts ?? result.models?.find(m => m.provider === info.model?.provider && m.id === info.model?.id)?.efforts ?? [], info.thinking);
  $<HTMLButtonElement>('card-model-confirm').disabled = select.options.length === 0;
  $('card-model-status').textContent = info.model ? 'Modelo efectivo: ' + describe(info.model.name, info.thinking) : '';
}

const THINKING_LABELS: Record<Thinking, string> = { off: 'Sin razonamiento', minimal: 'Mínimo', low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' };
const describe = (model: string, thinking: Thinking | null) => model + (thinking ? ' · ' + THINKING_LABELS[thinking] : '');
/** Offers only the levels the chosen model accepts, keeping the current one when still valid. */
function fillThinking(efforts: readonly Thinking[], current: Thinking | null) {
  const select = $<HTMLSelectElement>('card-thinking');
  select.replaceChildren();
  for (const level of efforts) {
    const option = document.createElement('option');
    option.value = level; option.textContent = THINKING_LABELS[level];
    select.append(option);
  }
  select.value = current && efforts.includes(current) ? current : efforts.includes('medium') ? 'medium' : efforts[0] ?? '';
  select.disabled = efforts.length === 0;
  select.title = efforts.length ? 'Cuánto razona el modelo antes de responder' : 'Este modelo no tiene grados de razonamiento';
}
function failure(error: unknown): CommandResult {
  return { id: '', ok: false, code: 'offline', message: error instanceof Error ? error.message : String(error) };
}
const target = () => selected ? state.actors.get(selected)?.info : undefined;
async function applyModel() {
  const info = target(); if (!info) return;
  const modelSelect = $<HTMLSelectElement>('card-model'), thinkingSelect = $<HTMLSelectElement>('card-thinking');
  if (!modelSelect.value) return;
  const actorId = selected;
  const confirm = $<HTMLButtonElement>('card-model-confirm');
  const model = JSON.parse(modelSelect.value) as ModelRef;
  const thinking = (thinkingSelect.value || null) as Thinking | null;
  modelSelect.disabled = true; thinkingSelect.disabled = true; confirm.disabled = true;
  const result = await office.send({ id: crypto.randomUUID(), type: 'set-model', ref: info.ref, model, thinking }).catch(failure);
  if (selected !== actorId) return;
  modelSelect.disabled = false; thinkingSelect.disabled = !(model.efforts?.length); confirm.disabled = false;
  $('card-model-status').textContent = result.ok
    ? (result.status === 'queued' ? 'Pendiente: se aplicará al terminar el turno actual' : 'Aplicado: ' + describe(model.name, thinking))
    : 'Error: ' + result.message;
}
$<HTMLSelectElement>('card-model').onchange = () => {
  const model = JSON.parse($<HTMLSelectElement>('card-model').value) as ModelRef;
  fillThinking(model.efforts ?? [], ($<HTMLSelectElement>('card-thinking').value || null) as Thinking | null);
};
$('card-model-confirm').onclick = () => void applyModel();
function collectAnswers(request: PendingQuestion): Answer[] | null {
  const groups = [...$<HTMLFormElement>('card-questions').querySelectorAll<HTMLFieldSetElement>('.question-group')];
  let incomplete = false;
  const answers = request.questions.map((question): Answer => {
    const group = groups.find(field => field.dataset.questionId === question.id);
    const selectedOptions = group
      ? [...group.querySelectorAll<HTMLInputElement>('input:checked')].map(input => input.value)
      : [];
    const customInput = (request.questions.length === 1
      ? $<HTMLTextAreaElement>('card-message').value
      : group?.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '').trim();
    if (!question.multi && !selectedOptions.length && !customInput) incomplete = true;
    return { id: question.id, selectedOptions, ...(customInput ? { customInput } : {}) };
  });
  if (incomplete) {
    $('card-result').textContent = 'Elige una opción o escribe una respuesta para cada pregunta.';
    $('card-result').classList.add('error');
    return null;
  }
  return answers;
}
async function submitAnswer(info: AgentInfo, request: PendingQuestion, answers: Answer[]) {
  const actorId = selected;
  if (!actorId) return;
  const key = answerKey(actorId, request.requestId);
  if (answerLocked.has(key)) return;
  answerLocked.add(key); answerInFlight.add(key); syncQuestionControls();
  const result = await office.send({
    id: crypto.randomUUID(), type: 'answer', ref: info.ref, requestId: request.requestId, answers,
  }).catch(failure);
  if (result.ok) showMessageZap(actorId);
  answerInFlight.delete(key);
  const stillPending = pendingQuestion(state.actors.get(actorId)?.info)?.requestId === request.requestId;
  if (!stillPending) { answerLocked.delete(key); return; }
  if (selected !== actorId) {
    if (!result.ok) answerLocked.delete(key);
    if (!result.ok && result.code === 'stale') void office.snapshot().then(apply).catch(() => undefined);
    return;
  }
  if (result.ok) {
    if (request.questions.length === 1) $<HTMLTextAreaElement>('card-message').value = '';
    $('card-result').classList.remove('error');
    $('card-result').textContent = result.status === 'queued'
      ? 'Respuesta en cola; aún no está confirmada.'
      : 'Respuesta enviada.';
  } else {
    answerLocked.delete(key);
    $('card-result').classList.add('error');
    $('card-result').textContent = result.code === 'stale'
      ? 'La pregunta ya no está activa. Actualizando su estado…'
      : 'No se pudo enviar la respuesta: ' + result.message;
    syncQuestionControls();
    if (result.code === 'stale') void office.snapshot().then(apply).catch(() => undefined);
  }
}
$<HTMLFormElement>('card-questions').onsubmit = event => {
  event.preventDefault();
  const info = target(), request = pendingQuestion(info);
  if (!info || !request || request.questions.length < 2) return;
  const answers = collectAnswers(request);
  if (answers) void submitAnswer(info, request, answers);
};
async function sendMessage(delivery: 'steer' | 'followUp') {
  const info = target();
  if (!info) return;
  const request = pendingQuestion(info);
  if (request) {
    if (request.questions.length !== 1) {
      $('card-result').textContent = 'Responde todas las preguntas en el formulario.';
      $('card-result').classList.add('error');
      return;
    }
    const answers = collectAnswers(request);
    if (answers) await submitAnswer(info, request, answers);
    return;
  }
  const area = $<HTMLTextAreaElement>('card-message'), text = area.value.trim();
  if (!text) return;
  const actorId = selected, requestId = pendingQuestion(info)?.requestId ?? null;
  disableCard(true);
  const result = await office.send({ id: crypto.randomUUID(), type: 'message', ref: info.ref, text, delivery }).catch(failure);
  if (selected !== actorId) return;
  disableCard(false);
  if ((pendingQuestion(target())?.requestId ?? null) !== requestId) return;
  if (result.ok) area.value = '';
  $('card-result').classList.toggle('error', !result.ok);
  $('card-result').textContent = result.ok ? (result.status === 'queued' ? 'Recibido: en cola para ' + info.name : 'Entregado a ' + info.name) : 'No enviado: ' + result.message;
}
$('card-steer').onclick = () => void sendMessage('steer');
$('card-follow').onclick = () => void sendMessage('followUp');
$('card-close').onclick = () => { $('card').hidden = true; selected = null; };

function applyNames(next: OfficeNames) {
  names = next; scene.setNames(next);
  const actor = selected ? state.actors.get(selected) : undefined;
  if (actor) fillCard(actor);
  const project = selectedProject ? state.projects.get(selectedProject) : undefined;
  if (project) fillProject(project);
}
async function saveVisualName(kind: 'cat' | 'project') {
  const actor = selected ? state.actors.get(selected) : undefined;
  const project = selectedProject ? state.projects.get(selectedProject) : undefined;
  const key = kind === 'cat' ? actor && !actor.info.parent ? catNameKey(actor.info) : null : project?.id;
  if (!key) return;
  const prefix = kind === 'cat' ? 'cat' : 'project';
  const input = $<HTMLInputElement>(prefix + '-name-input'), button = $<HTMLButtonElement>(prefix + '-name-save');
  const result = $(prefix + '-name-result');
  input.disabled = true; button.disabled = true;
  let message = 'Nombre guardado.', failed = false;
  try {
    applyNames(await office.rename({ kind, key, name: input.value }));
  } catch (error) {
    message = 'No se pudo guardar: ' + String(error); failed = true;
  } finally { input.disabled = false; button.disabled = false; }
  const currentActor = selected ? state.actors.get(selected) : undefined;
  const stillSelected = kind === 'cat' ? currentActor && catNameKey(currentActor.info) === key : selectedProject === key;
  if (stillSelected) { result.textContent = message; result.classList.toggle('error', failed); }
}
$<HTMLFormElement>('cat-name-form').onsubmit = event => { event.preventDefault(); void saveVisualName('cat'); };
$<HTMLFormElement>('project-name-form').onsubmit = event => { event.preventDefault(); void saveVisualName('project'); };
void office.names().then(applyNames).catch(error => { $('cat-name-result').textContent = 'No se pudieron cargar los nombres: ' + String(error); });

async function refreshUsage() {
  if (usageLoading) return;
  usageLoading = true; $<HTMLButtonElement>('usage-refresh').disabled = true;
  $('usage-status').textContent = 'Consultando /usage…'; $('usage-status').classList.remove('error');
  $('usage-content').textContent = '';
  try {
    const result = await office.usage();
    if (result.ok) {
      $('usage-content').textContent = result.text; $('usage-status').textContent = 'Datos actualizados.';
    } else { $('usage-status').textContent = result.message; $('usage-status').classList.add('error'); }
  } catch (error) { $('usage-status').textContent = 'No se pudo consultar usage: ' + String(error); $('usage-status').classList.add('error'); }
  finally { usageLoading = false; $<HTMLButtonElement>('usage-refresh').disabled = false; }
}
async function openBoss() {
  selected = null; selectedProject = null;
  for (const id of ['card', 'project', 'history', 'setup']) $(id).hidden = true;
  $('boss').hidden = false;
  await refreshUsage();
}
$('boss-close').onclick = () => { $('boss').hidden = true; };
$('usage-refresh').onclick = () => { void refreshUsage(); };

function fillProject(project: Project) {
  $('project-name').textContent = projectName(project, names);
  $('project-cwd').textContent = project.cwd;
  const members = project.members.map(id => state.actors.get(id)!).filter(Boolean);
  const roots = members.filter(actor => !actor.info.parent);
  const robots = activeTheme() === 'robots';
  $('project-count').textContent = `${roots.length} ${robots ? 'agentes robot' : 'agentes'} · ${members.length - roots.length} ${robots ? 'subagentes robot' : 'subagentes'}`;
  const key = JSON.stringify([project.id, roots.map(actor => [actor.id, actorName(actor, names)])]);
  if (key !== projectMembersKey) {
    projectMembersKey = key;
    const list = $('project-members'); list.replaceChildren();
    for (const actor of roots) {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.textContent = actorName(actor, names);
      button.onclick = () => { const current = state.actors.get(actor.id); if (current) void openCard(current); };
      item.append(button); list.append(item);
    }
    if (!roots.length) {
      const item = document.createElement('li');
      item.textContent = `No hay ${robots ? 'agentes robot' : 'agentes'} asignados; solo ${robots ? 'subagentes robot' : 'subagentes'}.`;
      list.append(item);
    }
  }
}
function openProject(project: Project) {
  $('boss').hidden = true;
  $<HTMLInputElement>('project-name-input').value = names.projects[project.id] ?? '';
  $('project-name-result').textContent = '';
  selected = null; selectedProject = project.id;
  $('card').hidden = true; $('history').hidden = true; $('setup').hidden = true;
  fillProject(project); $('project').hidden = false;
}
$('project-close').onclick = () => { $('project').hidden = true; selectedProject = null; };

async function openHistory() {
  $('project').hidden = true; selectedProject = null;
  $('boss').hidden = true;
  $('history').hidden = false; $('card').hidden = true; selected = null;
  const rows = $('history-rows'); rows.replaceChildren();
  const records = await office.history().catch(() => []);
  const labels = { saved: 'Guardada', missing: 'Archivo no disponible', ephemeral: 'Sin historial guardado' };
  for (const record of records) {
    const row = document.createElement('tr');
    for (const [value, cls] of [[record.project, ''], [record.title, ''], [record.cwd, 'path'], [labels[record.availability], '']] as const) {
      const cell = document.createElement('td'); cell.textContent = value; if (cls) cell.className = cls; row.append(cell);
    }
    const action = document.createElement('td'), open = document.createElement('button');
    open.textContent = 'Abrir carpeta';
    open.onclick = async () => {
      const error = await office.showFolder(record.profile, record.sessionId);
      $('history-result').textContent = error ?? '';
    };
    const conversation = document.createElement('button');
    conversation.textContent = 'Ir a la conversación';
    conversation.onclick = async () => {
      conversation.disabled = true;
      try {
        const error = await office.openConversation(record.profile, record.sessionId);
        $('history-result').textContent = error ?? '';
      } catch {
        $('history-result').textContent = 'No se pudo abrir la conversación.';
      } finally { conversation.disabled = false; }
    };
    action.append(open, conversation); row.append(action); rows.append(row);
  }
  if (!records.length) $('history-result').textContent = 'No hay conversaciones en los últimos 7 días.';
}
$('history-button').onclick = () => void openHistory();
$('history-close').onclick = () => { $('history').hidden = true; };
$('minimize').onclick = () => office.minimize();
$('close').onclick = () => office.close();
$('mute').onclick = () => {
  muted = !muted; office.setMuted(muted);
  $('mute').setAttribute('aria-pressed', String(muted)); $('mute').textContent = muted ? 'Silencio' : 'Sonido';
};
office.onVisibility(visible => scene.setVisible(visible));
office.subscribe(apply);
office.onBriefing(id => { if (!briefings.includes(id)) briefings.push(id); scene.offerBriefing(); renderNotices(); });
void office.muted().then(value => { muted = value; $('mute').setAttribute('aria-pressed', String(muted)); $('mute').textContent = muted ? 'Silencio' : 'Sonido'; });
void office.version().then(version => { $('app-version').textContent = 'v' + version; });
function showAppUpdate(update: unknown) {
  if (!update || typeof update !== 'object') return;
  const { version, currentVersion } = update as { version?: unknown; currentVersion?: unknown };
  if (typeof version !== 'string' || typeof currentVersion !== 'string' || !version.trim() || !currentVersion.trim()) return;
  $('app-update-versions').textContent = `Versión instalada: ${currentVersion} · Nueva versión: ${version}`;
  $('app-update-notice').hidden = false;
}
function setAppUpdateState(message: string, error = false) {
  const state = $('app-update-state');
  state.setAttribute('role', error ? 'alert' : 'status');
  state.setAttribute('aria-live', error ? 'assertive' : 'polite');
  state.textContent = message;
}
async function installAppUpdate() {
  const button = $('app-update-install');
  if (button.getAttribute('aria-disabled') === 'true') return;
  button.setAttribute('aria-disabled', 'true');
  $('app-update-action-label').textContent = 'Descargando e instalando…';
  setAppUpdateState('Descargando e instalando la actualización…');
  try {
    const result = await office.installAppUpdate();
    if (result.ok) {
      setAppUpdateState(result.message.trim() || 'La actualización se inició correctamente.');
      $('app-update-action-label').textContent = 'Actualización iniciada';
      return;
    }
    setAppUpdateState(result.message.trim() || 'No se pudo instalar la actualización. Inténtalo de nuevo.', true);
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : '';
    setAppUpdateState(message || 'No se pudo instalar la actualización. Inténtalo de nuevo.', true);
  }
  $('app-update-action-label').textContent = 'Reintentar actualización';
  button.removeAttribute('aria-disabled');
}
$('app-update-notice').onclick = () => { void installAppUpdate(); };
$('app-update-close').onclick = event => {
  event.stopPropagation();
  $('app-update-notice').hidden = true;
};
void office.checkAppUpdate().then(showAppUpdate).catch(() => undefined);
void office.snapshot().then(apply);
// Connecting omp is an explicit user action: the office never changes omp on its own.
void office.bridgeStatus().then(status => {
  if (status !== 'install' && status !== 'update') return;
  const button = document.createElement('button');
  button.className = 'notice briefing';
  button.textContent = status === 'install' ? 'Conectar la oficina con omp' : 'Actualizar el puente de omp';
  const detail = document.createElement('small');
  detail.textContent = 'Añade solo la carpeta extensions\\nter-office a tu perfil de omp';
  button.append(detail);
  button.onclick = async () => {
    button.disabled = true;
    const result = await office.installBridge();
    detail.textContent = result.message;
    if (!result.ok) button.disabled = false;
    else setTimeout(() => button.remove(), 15000);
  };
  $('notices').append(button);
}).catch(() => undefined);

// Personalización: el tema se elige al iniciar y la ropa animal se conserva al alternar.
type Tab = 'breed' | 'dog' | 'cat' | 'mouse';
let tab: Tab = 'breed';
function preview(canvas: HTMLCanvasElement, who: Parameters<Painter['character']>[2], outfit: Outfit) {
  canvas.width = 96; canvas.height = 120;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  if (who.kind === 'robot') {
    context.setTransform(1.5, 0, 0, 1.5, 0, 0);
    new Painter(context, logo).character(32, 42, who, outfit, 'stand');
  } else {
    context.setTransform(2, 0, 0, 2, 0, 0);
    new Painter(context, logo).character(22, 23, who, outfit, 'stand');
  }
}
function renderChoices<K extends string>(
  id: string, choices: Readonly<Record<K, string>>, selected: K,
  character: (choice: K) => Parameters<Painter['character']>[2], choose: (choice: K) => void,
) {
  const root = $(id); root.replaceChildren();
  for (const [choice, label] of Object.entries(choices) as [K, string][]) {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'option'; option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(selected === choice)); option.setAttribute('aria-label', label);
    const canvas = document.createElement('canvas');
    preview(canvas, character(choice), draft.outfits.dog);
    const caption = document.createElement('span'); caption.textContent = label;
    option.append(canvas, caption);
    option.onclick = () => {
      choose(choice);
      scene.setAppearance(draft);
      renderOptions();
    };
    root.append(option);
  }
}
function renderOptions() {
  const robots = (draft.theme ?? 'robots') === 'robots';
  $('animal-controls').hidden = robots;
  $('robot-controls').hidden = !robots;
  $('robot-appearance-note').hidden = !robots;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="appearance-theme"]')) input.checked = input.value === (draft.theme ?? 'robots');
  updateThemeText();
  const root = $('setup-options'); root.replaceChildren();
  if (robots) {
    const colors = { ...DEFAULT_ROBOT_COLORS, ...(draft.robotColors ?? DEFAULT_ROBOT_COLORS) };
    const human = { ...DEFAULT_HUMAN, ...(draft.human ?? DEFAULT_HUMAN) };
    renderChoices<RobotColor>('agent-robot-colors', ROBOT_COLORS, colors.agent,
      color => ({ kind: 'robot', role: 'agent', color }),
      color => { draft = { ...draft, robotColors: { ...colors, agent: color } }; });
    renderChoices<RobotColor>('subagent-robot-colors', ROBOT_COLORS, colors.subagent,
      color => ({ kind: 'robot', role: 'subagent', color }),
      color => { draft = { ...draft, robotColors: { ...colors, subagent: color } }; });
    renderChoices<HumanGender>('human-genders', HUMAN_GENDERS, human.gender,
      gender => ({ kind: 'human', ...human, gender }),
      gender => { draft = { ...draft, human: { ...human, gender } }; });
    renderChoices<HumanSkin>('human-skins', HUMAN_SKINS, human.skin,
      skin => ({ kind: 'human', ...human, skin }),
      skin => { draft = { ...draft, human: { ...human, skin } }; });
    renderChoices<HumanHairColor>('human-hair-colors', HUMAN_HAIR_COLORS, human.hair,
      hair => ({ kind: 'human', ...human, hair }),
      hair => { draft = { ...draft, human: { ...human, hair } }; });
    renderChoices<HumanHairStyle>('human-hair-styles', HUMAN_HAIR_STYLES, human.style,
      style => ({ kind: 'human', ...human, style }),
      style => { draft = { ...draft, human: { ...human, style } }; });
    return;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs [data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  const entries: [string, string][] = Object.entries(tab === 'breed' ? BREEDS : OUTFITS);
  for (const [id, label] of entries) {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'option'; option.setAttribute('role', 'radio');
    const chosen = tab === 'breed' ? draft.breed === id : draft.outfits[tab] === id;
    option.setAttribute('aria-checked', String(chosen));
    const canvas = document.createElement('canvas');
    if (tab === 'breed') preview(canvas, { kind: 'dog', breed: id as Breed }, draft.outfits.dog);
    else preview(canvas, tab === 'dog' ? { kind: 'dog', breed: draft.breed } : tab === 'cat' ? { kind: 'cat', coat: COATS[0]! } : { kind: 'mouse' }, id as Outfit);
    const caption = document.createElement('span'); caption.textContent = label;
    option.append(canvas, caption);
    option.onclick = () => {
      draft = tab === 'breed' ? { ...draft, breed: id as Breed } : { ...draft, outfits: { ...draft.outfits, [tab]: id as Outfit } };
      scene.setAppearance(draft); // live preview in the office while choosing
      renderOptions();
    };
    root.append(option);
  }
}
function openCustomize(firstRun = false) {
  $('project').hidden = true; selectedProject = null;
  $('boss').hidden = true;
  draft = {
    ...appearance, outfits: { ...appearance.outfits },
    robotColors: { ...DEFAULT_ROBOT_COLORS, ...(appearance.robotColors ?? DEFAULT_ROBOT_COLORS) },
    human: { ...DEFAULT_HUMAN, ...(appearance.human ?? DEFAULT_HUMAN) },
    theme: appearance.theme ?? 'robots',
  };
  $('setup-title').textContent = firstRun ? '¡Bienvenido! Elige cómo quieres ver la oficina' : 'Ajustes';
  $('setup-result').textContent = '';
  $('setup').hidden = false; $('card').hidden = true; $('history').hidden = true; selected = null;
  tab = 'breed'; renderOptions();
}
async function saveAppearance(value: Appearance) {
  const next: Appearance = {
    ...value, theme: value.theme ?? 'robots',
    robotColors: { ...DEFAULT_ROBOT_COLORS, ...(value.robotColors ?? DEFAULT_ROBOT_COLORS) },
    human: { ...DEFAULT_HUMAN, ...(value.human ?? DEFAULT_HUMAN) },
  };
  const save = $<HTMLButtonElement>('setup-save');
  save.disabled = true;
  try {
    await office.setAppearance(next);
  } catch (error) {
    $('setup-result').textContent = 'No se pudo guardar el aspecto: ' + String(error);
    return;
  } finally { save.disabled = false; }
  appearance = next; draft = next; scene.setAppearance(next);
  $('setup').hidden = true;
  updateThemeText();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs [data-tab]')) button.onclick = () => { tab = button.dataset.tab as Tab; renderOptions(); };
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="appearance-theme"]')) input.onchange = () => {
  if (!input.checked) return;
  draft = { ...draft, theme: input.value as NonNullable<Appearance['theme']> };
  scene.setAppearance(draft);
  renderOptions();
};
$('customize-button').onclick = () => openCustomize();
$('setup-save').onclick = () => void saveAppearance(draft);
$('setup-default').onclick = () => {
  draft = {
    ...DEFAULT_APPEARANCE, theme: draft.theme ?? 'robots',
    robotColors: { ...DEFAULT_ROBOT_COLORS, ...(draft.robotColors ?? DEFAULT_ROBOT_COLORS) },
    human: { ...DEFAULT_HUMAN, ...(draft.human ?? DEFAULT_HUMAN) },
  };
  scene.setAppearance(draft); renderOptions();
};
$('setup-close').onclick = () => {
  scene.setAppearance(appearance); $('setup').hidden = true; updateThemeText();
};
const alwaysOnTopToggle = $<HTMLInputElement>('always-on-top');
let alwaysOnTopTouched = false;
alwaysOnTopToggle.onchange = () => { alwaysOnTopTouched = true; office.setAlwaysOnTop(alwaysOnTopToggle.checked); };
$('restore-bounds').onclick = () => office.restoreBounds();
void office.alwaysOnTop().then(value => { if (!alwaysOnTopTouched) alwaysOnTopToggle.checked = value; });
const tokenSavingToggle = $<HTMLInputElement>('token-saving');
const tokenSavingStatus = $('token-saving-status');
let tokenSavingValue = true, tokenSavingReady = false;
tokenSavingToggle.onchange = async () => {
  if (!tokenSavingReady) return;
  const next = tokenSavingToggle.checked;
  tokenSavingToggle.disabled = true;
  tokenSavingStatus.classList.remove('error');
  tokenSavingStatus.textContent = 'Guardando…';
  try {
    await office.setTokenSaving(next);
    tokenSavingValue = next;
    tokenSavingStatus.textContent = 'Preferencia guardada.';
  } catch (error) {
    tokenSavingToggle.checked = tokenSavingValue;
    tokenSavingStatus.classList.add('error');
    tokenSavingStatus.textContent = 'No se pudo guardar la preferencia: ' + String(error);
  } finally { tokenSavingToggle.disabled = false; }
};
void office.tokenSaving().then(value => {
  tokenSavingValue = value;
  tokenSavingToggle.checked = value;
  tokenSavingReady = true;
  tokenSavingToggle.disabled = false;
}).catch(error => {
  tokenSavingStatus.classList.add('error');
  tokenSavingStatus.textContent = 'No se pudo cargar la preferencia: ' + String(error);
});
void office.appearance().then(saved => {
  appearance = saved ? {
    ...saved,
    theme: saved.theme ?? 'robots',
    robotColors: { ...DEFAULT_ROBOT_COLORS, ...(saved.robotColors ?? DEFAULT_ROBOT_COLORS) },
    human: { ...DEFAULT_HUMAN, ...(saved.human ?? DEFAULT_HUMAN) },
  } : DEFAULT_APPEARANCE;
  scene.setAppearance(appearance);
  updateThemeText();
  if (!saved?.theme) openCustomize(true); // first run or legacy record without a theme
}).catch(error => {
  console.error('No se pudo cargar la apariencia:', error);
}).finally(() => {
  appearanceReady = true;
  for (const id of deferredZaps) scene.zap(id);
  deferredZaps.length = 0;
});
logo.addEventListener('load', () => { if (!$('setup').hidden) renderOptions(); });
