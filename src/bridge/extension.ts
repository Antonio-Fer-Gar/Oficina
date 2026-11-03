import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { ActivityTracker } from '../activity.ts';
import { createBridgeServer, type BridgeHost } from './pipe.ts';
import { createPendingQuestion, raceAsk, type PendingOfficeQuestion, type Submission } from './questions.ts';
import { ThinkingSchema, type AgentInfo, type Answer, type CommandResult, type ModelRef, type OfficeCommand, type PendingQuestion, type Thinking } from './protocol.ts';

const instanceId = randomUUID(), generation = randomUUID(), startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
const dataDir = process.env.NTER_OFFICE_DATA ?? join(process.env.LOCALAPPDATA ?? homedir(), 'nter-omp-office');
const records = new Map<string, Binding>();
let host: BridgeHost | undefined;
let launchChecked = false;
const LauncherSchema = z.object({ command: z.string().min(1), args: z.array(z.string()), pid: z.number().int().positive().nullable() });
/** Starts the office once per omp process if the user has it installed but closed; the app itself stays single-instance. */
function launchOffice() {
  if (launchChecked) return;
  launchChecked = true;
  let launcher: z.infer<typeof LauncherSchema>;
  try { launcher = LauncherSchema.parse(JSON.parse(readFileSync(join(dataDir, 'launcher.json'), 'utf8'))); } catch { return; }
  if (launcher.pid) {
    try { process.kill(launcher.pid, 0); return; } catch { /* not running: launch below */ }
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(launcher.command, [...launcher.args, '--from-omp'], { detached: true, stdio: 'ignore', env });
    child.on('error', () => undefined); // A moved/uninstalled office must never break the omp session.
    child.unref();
  } catch { /* office not installed anymore */ }
}
let opening: Promise<void> | undefined;
interface ActiveQuestion {
  broker: PendingOfficeQuestion; controller: AbortController;
}
interface Binding {
  pi: ExtensionAPI; ctx: ExtensionContext; info: AgentInfo;
  pendingModel: { model: ModelRef; thinking: Thinking | null } | null;
  pendingAsk: ActiveQuestion | null; attention: Set<string>; consultingUntil: number; tools: ActivityTracker;
}
const WriteTarget = z.object({ path: z.string() });
type OmpModel = ReturnType<ExtensionContext['models']['list']>[number];
/** Reasoning levels the model declares, plus `off`; empty for models without adjustable reasoning. */
function modelRef(model: OmpModel): ModelRef {
  const declared = model.reasoning ? (model.thinking?.efforts ?? []) : [];
  const efforts = declared.flatMap(level => { const parsed = ThinkingSchema.safeParse(level); return parsed.success ? [parsed.data] : []; });
  return { provider: model.provider, id: model.id, name: model.name, efforts: efforts.length ? ['off', ...efforts] : [] };
}
function clearPendingQuestion(binding: Binding, pending = binding.pendingAsk, abortNative = false) {
  if (!pending) return;
  pending.broker.cancel();
  if (binding.pendingAsk === pending) {
    binding.pendingAsk = null;
    binding.info.question = null;
  }
  if (abortNative && !pending.controller.signal.aborted) pending.controller.abort();
}
function submissionResult(id: string, submission: Submission): CommandResult {
  return submission.ok
    ? { id, ok: true, status: 'applied' }
    : { id, ok: false, code: submission.code, message: submission.message };
}
type AskQuestion = PendingQuestion['questions'][number];
function formatAskAnswerLine(question: AskQuestion, answer: Answer) {
  const custom = answer.customInput === undefined ? undefined : `"${answer.customInput}"`;
  if (!answer.selectedOptions.length) {
    if (custom !== undefined) return `${question.id}: ${custom}`;
    return question.multi ? `${question.id}: []` : `${question.id}: (cancelled)`;
  }
  const selected = question.multi ? `[${answer.selectedOptions.join(', ')}]` : answer.selectedOptions[0];
  return `${question.id}: ${custom === undefined ? selected : `${selected} + ${custom}`}`;
}
function officeAskResult(questions: AskQuestion[], answers: Answer[]) {
  const formatSingle = (answer: Answer, multi: boolean) => {
    const parts: string[] = [];
    if (answer.selectedOptions.length) {
      parts.push(`User selected: ${multi ? answer.selectedOptions.join(', ') : answer.selectedOptions[0]}`);
    }
    if (answer.customInput !== undefined) {
      const input = answer.customInput.includes('\n')
        ? `\n${answer.customInput.split('\n').map(line => `  ${line}`).join('\n')}`
        : ` ${answer.customInput}`;
      parts.push(`User provided custom input:${input}`);
    }
    return parts.join('\n') || (multi ? 'User did not select any options' : 'User cancelled the selection');
  };
  if (questions.length === 1) {
    const question = questions[0]!, answer = answers[0]!, multi = question.multi ?? false;
    return {
      content: [{ type: 'text' as const, text: formatSingle(answer, multi) }],
      details: {
        question: question.question, options: question.options.map(option => option.label),
        multi, selectedOptions: answer.selectedOptions, customInput: answer.customInput,
      },
    };
  }
  return {
    content: [{ type: 'text' as const, text: `User answers:\n${questions.map((question, index) => formatAskAnswerLine(question, answers[index]!)).join('\n')}` }],
    details: {
      results: questions.map((question, index) => {
        const answer = answers[index]!;
        return {
          id: question.id, question: question.question, options: question.options.map(option => option.label),
          multi: question.multi ?? false, selectedOptions: answer.selectedOptions, customInput: answer.customInput,
        };
      }),
    },
  };
}

async function persistMetadata(binding: Binding) {
  const conversation = binding.info.conversation;
  if (!conversation) return;
  const directory = join(dataDir, 'conversations');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const key = createHash('sha256').update(conversation.profile + '\0' + conversation.sessionId).digest('hex');
  const file = join(directory, key + '.json'), temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(conversation), { mode: 0o600 });
  await rename(temporary, file);
}
function refresh(binding: Binding) {
  const { ctx, pi, info } = binding;
  const model = ctx.models.current();
  info.model = model ? modelRef(model) : null;
  const thinking = ThinkingSchema.safeParse(pi.getThinkingLevel());
  info.thinking = thinking.success ? thinking.data : null;
  info.queued = ctx.hasPendingMessages() ? 1 : 0;
  const async = ctx.getAsyncJobSnapshot();
  info.pendingAsync = !!async && (async.running.length > 0 || async.delivery.queued > 0 || async.delivery.delivering);
  info.runningChildren = [...records.values()].filter(item => item.info.parent?.agentId === info.ref.agentId && item.info.phase === 'working').length;
  if (binding.pendingAsk || binding.attention.size || ctx.getPendingPlanReview()) info.phase = 'waiting-human';
  else if (binding.consultingUntil > Date.now()) info.phase = 'asking-parent';
  else info.phase = ctx.isIdle() && !info.queued && !info.pendingAsync && !info.runningChildren ? 'idle' : 'working';
  Object.assign(info, binding.tools.publish(ctx.isIdle()));
  if (info.conversation) {
    info.conversation.title = pi.getSessionName() ?? info.ref.sessionId;
    info.conversation.sessionFile = ctx.sessionManager.getSessionFile() ?? null;
  }
}
async function dispatch(command: OfficeCommand): Promise<CommandResult> {
  const binding = records.get(command.ref.agentId);
  const ref = binding?.info.ref;
  if (!binding || !ref || ref.instanceId !== command.ref.instanceId || ref.generation !== command.ref.generation ||
    ref.sessionId !== command.ref.sessionId || ref.agentId !== command.ref.agentId) {
    return { id: command.id, ok: false, code: 'stale', message: 'El agente seleccionado ya ha terminado' };
  }
  if (command.type === 'models') return { id: command.id, ok: true, status: 'applied', models: binding.ctx.models.list().map(modelRef) };
  if (command.type === 'answer') {
    const pending = binding.pendingAsk;
    return pending
      ? submissionResult(command.id, pending.broker.submit(command.requestId, command.answers))
      : { id: command.id, ok: false, code: 'stale', message: 'La pregunta ya no está pendiente' };
  }
  if (command.type === 'message') {
    const pending = binding.pendingAsk;
    if (pending) return submissionResult(command.id, pending.broker.submitMessage(pending.broker.question.requestId, command.text));
    const queued = !binding.ctx.isIdle();
    binding.pi.sendUserMessage(command.text, { deliverAs: command.delivery });
    return { id: command.id, ok: true, status: queued ? 'queued' : 'applied' };
  }
  const model = binding.ctx.models.list().find(model => model.provider === command.model.provider && model.id === command.model.id);
  if (!model) return { id: command.id, ok: false, code: 'invalid', message: 'Ese modelo no está disponible en esta sesión' };
  if (command.thinking && !modelRef(model).efforts?.includes(command.thinking)) return { id: command.id, ok: false, code: 'invalid', message: 'Ese modelo no admite el grado ' + command.thinking };
  if (!binding.ctx.isIdle()) {
    binding.pendingModel = { model: command.model, thinking: command.thinking };
    return { id: command.id, ok: true, status: 'queued' };
  }
  const current = binding.ctx.models.current();
  const applied = current?.provider === model.provider && current.id === model.id ? true : await binding.pi.setModel(model);
  // omp types levels as a const enum whose runtime values are exactly these validated strings.
  if (applied && command.thinking) binding.pi.setThinkingLevel(command.thinking as Parameters<ExtensionAPI['setThinkingLevel']>[0]);
  refresh(binding);
  return applied ? { id: command.id, ok: true, status: 'applied' } : { id: command.id, ok: false, code: 'unsupported', message: 'omp no aceptó este modelo' };
}

export default function officeExtension(pi: ExtensionAPI) {
  let binding: Binding | undefined;
  const update = async (ctx: ExtensionContext) => {
    if (!binding || binding.info.ref.sessionId !== ctx.sessionManager.getSessionId()) {
      if (binding) clearPendingQuestion(binding, binding.pendingAsk, true);
      const parent = ctx.agent.parentId ? records.get(ctx.agent.parentId)?.info.ref ?? null : null;
      const sessionId = ctx.sessionManager.getSessionId();
      const cwd = realpathSync.native(ctx.cwd);
      const root = ctx.agent.kind === 'main';
      const marker = 'nter-' + instanceId.slice(0, 8);
      binding = { pi, ctx, attention: new Set(), tools: new ActivityTracker(), pendingModel: null, pendingAsk: null, consultingUntil: 0, info: {
        ref: { instanceId, generation, sessionId, agentId: ctx.agent.id }, parent,
        name: ctx.agent.name ?? ctx.agent.id, cwd, model: null, thinking: null, phase: 'idle', activity: '',
        queued: 0, pendingAsync: false, runningChildren: 0, question: null,
        terminal: root && ctx.mode === 'tui' ? { pid: process.pid, startedAt, kind: process.env.WT_SESSION ? 'windows-terminal' : 'classic', wtSession: process.env.WT_SESSION, marker } : null,
        conversation: root ? { profile: process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? 'default', sessionId,
          project: basename(cwd) || cwd, cwd, title: pi.getSessionName() ?? sessionId,
          sessionFile: ctx.sessionManager.getSessionFile() ?? null, openedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), closedAt: null } : null,
      } };
      records.set(ctx.agent.id, binding);
    }
    binding.ctx = ctx;
    refresh(binding);
    await persistMetadata(binding);
  };
  let nativeAskWrapped = false;
  const wrapNativeAsk = (ctx: ExtensionContext) => {
    if (nativeAskWrapped || !ctx.hasUI) return;
    const nativeAsk = pi.getAllTools().find(tool => tool.name === 'ask' && tool.sourceInfo.source === 'builtin');
    if (!nativeAsk) return;
    const wrapper: Parameters<ExtensionAPI['registerTool']>[0] & { concurrency: 'exclusive' } = {
      name: 'ask', label: 'Ask', description: nativeAsk.description, parameters: nativeAsk.parameters,
      approval: 'read', strict: true, loadMode: 'discoverable', concurrency: 'exclusive',
      execute: async (_toolCallId, params, signal, onUpdate, toolCtx) => {
        const args = params as Record<string, unknown>;
        const invokeNative = toolCtx.invokeTool;
        if (!invokeNative) throw new Error('Native ask delegation is unavailable');
        if (!toolCtx.hasUI) return invokeNative(args, { signal, onUpdate });
        const current = records.get(toolCtx.agent.id);
        if (!current || current.info.ref.sessionId !== toolCtx.sessionManager.getSessionId()) {
          return invokeNative(args, { signal, onUpdate });
        }
        if (current.pendingAsk) throw new Error('An ask is already pending');
        const questions = (params as { questions: AskQuestion[] }).questions;
        const broker = createPendingQuestion(randomUUID(), questions);
        const controller = new AbortController();
        const pending: ActiveQuestion = { broker, controller };
        const abortFromCaller = () => {
          clearPendingQuestion(current, pending);
          controller.abort(signal?.reason);
        };
        current.pendingAsk = pending;
        current.info.question = broker.question;
        if (signal?.aborted) abortFromCaller();
        else signal?.addEventListener('abort', abortFromCaller, { once: true });
        try {
          const winner = await raceAsk(invokeNative(args, { signal: controller.signal, onUpdate }), broker.response, () => controller.abort());
          return winner.kind === 'native' ? winner.result : officeAskResult(questions, winner.answers);
        } finally {
          signal?.removeEventListener('abort', abortFromCaller);
          clearPendingQuestion(current, pending);
        }
      },
    };
    pi.registerTool(wrapper);
    nativeAskWrapped = true;
  };
  pi.on('session_start', async (_event, ctx) => {
    await update(ctx);
    wrapNativeAsk(ctx);
    // Only interactive consoles open the office; RPC/print automation stays headless.
    if (ctx.agent.kind === 'main' && ctx.mode === 'tui') launchOffice();
    if (!opening) opening = (async () => {
      host = await createBridgeServer({ registryDir: join(dataDir, 'registry'), instanceId, generation,
        agents: () => { for (const record of records.values()) refresh(record); return [...records.values()].map(record => record.info); }, dispatch });
    })();
    await opening;
    ctx.setInterval(() => {
      if (!binding) return;
      refresh(binding);
      if (ctx.mode === 'tui' && ctx.agent.kind === 'main') ctx.ui.setTitle((pi.getSessionName() ?? basename(ctx.cwd)) + ' · ' + binding.info.terminal?.marker);
      if (binding.pendingModel && ctx.isIdle()) {
        const pending = binding.pendingModel;
        binding.pendingModel = null;
        void dispatch({ id: randomUUID(), type: 'set-model', ref: binding.info.ref, model: pending.model, thinking: pending.thinking }).then(result => {
          if (!result.ok) ctx.ui.notify(result.message, 'warning');
        }).catch(error => ctx.ui.notify(String(error), 'warning'));
      }
    }, 1000);
  });
  pi.on('session_switch', async (_event, ctx) => { await update(ctx); wrapNativeAsk(ctx); });
  // Tool bookkeeping runs before awaiting persistence: omp runs handlers concurrently, so a
  // late start applied after its own end would leave a finished tool on screen.
  pi.on('agent_start', async (_event, ctx) => { const saving = update(ctx); binding?.tools.clear(); await saving; });
  pi.on('agent_end', async (_event, ctx) => {
    await update(ctx);
    if (binding?.info.conversation) { binding.info.conversation.lastActiveAt = new Date().toISOString(); await persistMetadata(binding); }
  });
  pi.on('tool_execution_start', async (event, ctx) => {
    const saving = update(ctx);
    if (binding) {
      binding.tools.start(event.toolCallId, event.toolName, event.args);
      if (event.toolName === 'ask' && ctx.hasUI) binding.attention.add(event.toolCallId);
      const target = WriteTarget.safeParse(event.args);
      if (event.toolName === 'write' && target.success && target.data.path === 'agent://' + ctx.agent.parentId) binding.consultingUntil = Date.now() + 2500;
    }
    await saving;
  });
  pi.on('tool_execution_end', async (event, ctx) => {
    const saving = update(ctx);
    binding?.tools.end(event.toolCallId);
    binding?.attention.delete(event.toolCallId);
    await saving;
  });
  pi.on('tool_approval_requested', async (event, ctx) => { await update(ctx); binding?.attention.add(event.toolCallId); });
  pi.on('tool_approval_resolved', async (event, ctx) => { await update(ctx); binding?.attention.delete(event.toolCallId); });
  pi.on('plan_review_requested', async (_event, ctx) => { await update(ctx); });
  pi.on('plan_review_resolved', async (_event, ctx) => { await update(ctx); });
  pi.on('session_shutdown', async (_event, ctx) => {
    const current = records.get(ctx.agent.id);
    if (current) {
      clearPendingQuestion(current, current.pendingAsk, true);
      if (current.info.conversation) {
        current.info.conversation.closedAt = new Date().toISOString();
        await persistMetadata(current);
      }
    }
    records.delete(ctx.agent.id);
    if (ctx.agent.kind === 'main' && host) { await host.close(); host = undefined; }
  });
}
