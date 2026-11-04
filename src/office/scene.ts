import { advanceOffice, type Actor, type OfficeState, type Project } from '../state.ts';
import { COATS, HUMAN_ZAP_HAND_OFFSET, Painter, type CharacterMotion, type Pose } from './sprites.ts';
import { DEFAULT_APPEARANCE, type Appearance } from './appearance.ts';
import { actorName, moleActor, projectName, type OfficeNames } from './names.ts';
import { workloadStress } from './workload.ts';
import { resolveActivity } from '../activity.ts';

export interface SceneLayout { unit: number; scale: number; worldWidth: number; roomWidth: number; bossX: number }
export interface Point { x: number; y: number }
type ZapEffect = { actorId: string; startedAt: number | null; motion: CharacterMotion };
/** Scale both rooms together while keeping the floor anchored to the bottom edge. */
export function computeLayout(contentWidth: number, viewport: { width: number; height: number }, scale?: number, requestedRoomWidth = 210): SceneLayout {
  const unit = viewport.height / 180, visible = viewport.width / unit;
  const roomWidth = requestedRoomWidth;
  const s = scale ?? Math.min(1, visible / Math.max(1, contentWidth));
  const worldWidth = visible / s;
  return { unit, scale: s, worldWidth, roomWidth, bossX: worldWidth - 83 };
}
export function toScreen(layout: SceneLayout, point: Point): Point {
  return { x: point.x * layout.scale * layout.unit, y: (180 + (point.y - 180) * layout.scale) * layout.unit };
}
export function toWorld(layout: SceneLayout, point: Point): Point {
  return { x: point.x / (layout.unit * layout.scale), y: 180 + (point.y / layout.unit - 180) / layout.scale };
}
export function hitTest(layout: SceneLayout, point: Point, actors: Iterable<{ id: string; x: number; y: number }>, messenger: Point | null,
  projects: Iterable<Pick<Project, 'id' | 'x' | 'installed'>> = []): string | { project: string } | null {
  const world = toWorld(layout, point);
  if (messenger) {
    const position = toScreen(layout, messenger), factor = layout.unit * layout.scale;
    if (Math.abs(position.x - point.x) < 22 * factor && point.y > position.y - 32 * factor && point.y < position.y + 35 * factor) return 'briefing';
  }
  let best: string | null = null, distance = Infinity;
  for (const actor of actors) {
    const position = toScreen(layout, actor), factor = layout.unit * layout.scale;
    if (Math.abs(position.x - point.x) >= 20 * factor || point.y <= position.y - 30 * factor || point.y >= position.y + 35 * factor) continue;
    const d = Math.hypot(position.x - point.x, position.y + 8 * factor - point.y);
    if (d < distance) { distance = d; best = actor.id; }
  }
  if (best) return best;
  if (Math.abs(layout.bossX - world.x) < 20 && world.y > 65 && world.y < 134) return 'boss';
  for (const project of projects) {
    if (project.installed && Math.abs(project.x - world.x) <= 31 && world.y >= 42 && world.y <= 99) return { project: project.id };
  }
  return null;
}

export interface SceneController {
  update(state: OfficeState): void;
  zap(actorId: string): void;
  offerBriefing(): void;
  dismissBriefing(): void;
  setVisible(visible: boolean): void;
  setAppearance(appearance: Appearance): void;
  setNames(names: OfficeNames): void;
  dispose(): void;
}
export function createScene(canvas: HTMLCanvasElement, logo: HTMLImageElement,
  handlers: { onSelect(actor: Actor): void; onProject(project: Project): void; onBoss(): void; onBriefing(): void }): SceneController {
  const context = canvas.getContext('2d', { alpha: false })!;
  const painter = new Painter(context, logo);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let state: OfficeState | null = null, frame = 0, last = performance.now(), visible = true, scale = 1, roomWidth = 210;
  let messenger: { x: number; y: number; arrived: boolean } | null = null;
  let appearance: Appearance = DEFAULT_APPEARANCE;
  let names: OfficeNames = { cats: {}, projects: {} }, stress = 0;
  const zaps: ZapEffect[] = [];
  let activeZap: ZapEffect | null = null, zapProgress = 0;
  const clearZaps = () => { zaps.length = 0; activeZap = null; zapProgress = 0; };
  const viewport = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const layout = () => computeLayout(state?.width ?? 1000, viewport(), scale, roomWidth);
  const wake = () => {
    if (visible && !frame) { last = performance.now(); frame = requestAnimationFrame(draw); }
  };
  const advanceZaps = (now: number) => {
    if (!state || appearance.theme !== 'robots') { clearZaps(); return; }
    activeZap = null; zapProgress = 0;
    for (let i = zaps.length - 1; i >= 0; i--) if (!state.actors.has(zaps[i]!.actorId)) zaps.splice(i, 1);
    const duration = reduced.matches ? 190 : 320;
    while (zaps.length) {
      const current = zaps[0]!, startedAt = current.startedAt ?? now;
      current.startedAt = startedAt;
      if (now - startedAt < duration) {
        activeZap = current; zapProgress = (now - startedAt) / duration;
        return;
      }
      const nextStart = startedAt + duration;
      zaps.shift();
      if (zaps.length && zaps[0]!.startedAt === null) zaps[0]!.startedAt = nextStart;
    }
  };
  const draw = (now: number) => {
    frame = 0;
    // Pixel-art movement remains smooth at 30 fps; avoid repainting the same frame at monitor refresh rate.
    if (now - last < 1000 / 30 - 1) { if (visible) frame = requestAnimationFrame(draw); return; }
    const dt = Math.min((now - last) / 1000, 0.06); last = now;
    const ratio = devicePixelRatio, size = viewport();
    if (canvas.width !== Math.round(size.width * ratio) || canvas.height !== Math.round(size.height * ratio)) {
      canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio);
    }
    context.imageSmoothingEnabled = false;
    if (state) {
      advanceOffice(state, dt);
      const target = computeLayout(state.width, size, undefined, state.roomWidth);
      const blend = Math.min(1, dt * 4);
      scale = reduced.matches ? target.scale : scale + (target.scale - scale) * blend;
      roomWidth = reduced.matches ? target.roomWidth : roomWidth + (target.roomWidth - roomWidth) * blend;
    }
    advanceZaps(now);
    const limbFrame = (Math.floor((state?.time ?? now / 1000) * 6) % 2) as 0 | 1;
    const l = layout();
    const zapTarget = activeZap ? state?.actors.get(activeZap.actorId) : undefined;
    const zapSide: -1 | 1 = zapTarget && zapTarget.x > l.bossX ? 1 : -1;
    if (activeZap) {
      activeZap.motion.zapSide = zapSide;
      activeZap.motion.zap = reduced.matches ? 'crack' : zapProgress < 0.14 ? 'windup' : zapProgress < 0.82 ? 'crack' : 'recoil';
    }
    context.setTransform(ratio * l.unit, 0, 0, ratio * l.unit, 0, 0);
    painter.floor(size.width / l.unit + 1);
    context.save();
    context.translate(0, 180 * (1 - l.scale)); context.scale(l.scale, l.scale);
    painter.breakRoom(l.roomWidth);
    painter.desk(l.bossX, 68); painter.chair(l.bossX, 94);
    painter.character(l.bossX, 99, appearance.theme === 'robots' ? { kind: 'human', stress, ...appearance.human } :
      { kind: 'dog', breed: appearance.breed, stress }, appearance.outfits.dog, 'sit', activeZap?.motion);
    painter.text('TÚ', l.bossX - 4, 146);
    if (state) {
      for (const project of state.projects.values()) {
        if (project.installed) { painter.desk(project.x, 68); painter.chair(project.x, 94); }
        if (project.members.length) painter.text(projectName(project, names).toUpperCase().slice(0, 22), project.x - 45, 37);
      }
    }
    context.restore();
    if (state) {
      const actors = [...state.actors.values()].sort((a, b) => a.y - b.y);
      const mole = appearance.theme === 'animals' ? moleActor(actors, names) : undefined;
      for (const actor of actors) {
        const bob = actor.moving && !reduced.matches ? Math.round(Math.sin(state.time * 11)) : 0;
        const position = toScreen(l, actor);
        context.save(); context.translate(position.x / l.unit, position.y / l.unit); context.scale(l.scale, l.scale);
        const dragging = actor.stage === 'drag' || actor.stage === 'return';
        if (dragging) painter.desk(-28, -20);
        const pose: Pose = actor.stage === 'seated' && !actor.moving ? 'sit'
          : actor.stage === 'coffee' && !actor.moving ? actor.sofaSlot !== null ? 'sofa' : 'coffee' : 'stand';
        const root = !actor.info.parent;
        const activity = !actor.moving && (actor.stage === 'seated' || actor.stage === 'waiting' || actor.stage === 'approach')
          ? resolveActivity(actor.info) : 'none';
        // Keep the feet on the same floor while making subagents visibly smaller.
        const characterScale = root ? 1 : 0.78;
        context.save();
        context.translate(0, 31 * (1 - characterScale)); context.scale(characterScale, characterScale);
        painter.character(0, bob, appearance.theme === 'robots'
          ? { kind: 'robot', role: root ? 'agent' : 'subagent', color: root ? appearance.robotColors?.agent : appearance.robotColors?.subagent }
          : root ? actor === mole ? { kind: 'mole' } : { kind: 'cat', coat: COATS[actor.order % COATS.length]! } : { kind: 'mouse' },
          root ? appearance.outfits.cat : appearance.outfits.mouse, pose,
          { walking: actor.moving, frame: limbFrame, activity, dragging });
        if (activity !== 'none') painter.activityProp(0, bob, activity, pose === 'sit', state.time, reduced.matches);
        context.restore();
        painter.modelBadge(0, root ? -42 + bob : -26 + bob * characterScale, actor.info.model);
        if (actor.stage === 'attention') painter.bubble(23, -24, '!', '#b5523b');
        if (actor.stage === 'consult') painter.bubble(23, -24, '?', '#5b7a96');
        context.restore();
      }
      if (activeZap && zapTarget && (reduced.matches || (zapProgress >= 0.14 && zapProgress < 0.82))) {
        const characterScale = zapTarget.info.parent ? 0.78 : 1;
        const pose: Pose = zapTarget.stage === 'seated' && !zapTarget.moving ? 'sit'
          : zapTarget.stage === 'coffee' && !zapTarget.moving ? zapTarget.sofaSlot !== null ? 'sofa' : 'coffee' : 'stand';
        const bob = zapTarget.moving && !reduced.matches ? Math.round(Math.sin(state.time * 11)) : 0;
        const headY = pose === 'sit' ? -17 : pose === 'sofa' ? -19 : -22;
        const targetX = zapTarget.x + (zapSide === -1 ? 11 : -11) * characterScale;
        const targetY = zapTarget.y + 31 * (1 - characterScale) + (bob + headY) * characterScale;
        const handX = (l.bossX + HUMAN_ZAP_HAND_OFFSET.x * (zapSide === 1 ? -1 : 1)) * l.scale;
        const handY = 180 + (99 + HUMAN_ZAP_HAND_OFFSET.y - 180) * l.scale;
        painter.electricZap(handX, handY, targetX * l.scale, 180 + (targetY - 180) * l.scale,
          reduced.matches ? 0 : (zapProgress - 0.14) / 0.68, l.scale, reduced.matches);
      }
      // Paint all labels last so the front row cannot cover the names behind it.
      for (const actor of actors) {
        const position = toScreen(l, actor), label = actorName(actor, names).toUpperCase().slice(0, 12);
        context.save(); context.translate(position.x / l.unit, position.y / l.unit); context.scale(l.scale, l.scale);
        context.font = '7px monospace';
        const width = context.measureText(label).width;
        painter.rect(-width / 2 - 1, 36, width + 2, 9, '#f4f4eddf');
        painter.text(label, -width / 2, 43);
        context.restore();
      }
    }
    if (messenger) {
      const targetX = l.bossX - 44;
      if (!messenger.arrived) {
        messenger.x = Math.min(targetX, messenger.x + dt * 85);
        messenger.arrived = messenger.x >= targetX;
      }
      const position = toScreen(l, messenger);
      context.save(); context.translate(position.x / l.unit, position.y / l.unit); context.scale(l.scale, l.scale);
      painter.character(0, 0, appearance.theme === 'robots' ? { kind: 'robot', role: 'agent', color: appearance.robotColors?.agent } : { kind: 'cat', coat: '#3f3a40' }, 'messenger', 'stand',
        { walking: !messenger.arrived, frame: limbFrame });
      if (messenger.arrived) painter.bubble(2, -24, '✉', '#7d6a3c');
      painter.text('MENSAJERO', -18, 43);
      context.restore();
    }
    if (logo.complete && logo.naturalWidth) context.drawImage(logo, size.width / l.unit / 2 - 11, 0, 22, 21);
    const resizing = state && (Math.abs(scale - computeLayout(state.width, size, undefined, state.roomWidth).scale) > 0.001 ||
      Math.abs(roomWidth - state.roomWidth) > 0.1);
    let moving = false, animating = false;
    if (state) for (const actor of state.actors.values()) {
      moving ||= actor.moving || actor.stage === 'fetch' || actor.stage === 'drag' || actor.stage === 'return-fetch' || actor.stage === 'return' || actor.stage === 'approach' ||
        (state.projects.get(actor.project)?.seat === actor.id && actor.stage !== 'seated');
      animating ||= !reduced.matches && !actor.moving && (actor.stage === 'seated' || actor.stage === 'waiting') &&
        resolveActivity(actor.info) !== 'none';
    }
    if (visible && (resizing || moving || animating || (messenger && !messenger.arrived) || zaps.length)) frame = requestAnimationFrame(draw);
  };
  const click = (event: MouseEvent) => {
    if (!state) return;
    const box = canvas.getBoundingClientRect();
    const hit = hitTest(layout(), { x: event.clientX - box.left, y: event.clientY - box.top },
      [...state.actors.values()].filter(actor => !actor.departing), messenger?.arrived ? messenger : null, state.projects.values());
    if (hit === 'briefing') handlers.onBriefing();
    else if (hit === 'boss') handlers.onBoss();
    else if (typeof hit === 'string') handlers.onSelect(state.actors.get(hit)!);
    else if (hit) handlers.onProject(state.projects.get(hit.project)!);
  };
  canvas.addEventListener('click', click);
  const resize = new ResizeObserver(wake);
  resize.observe(canvas);
  reduced.addEventListener('change', wake);
  logo.addEventListener('load', wake);
  wake();
  return {
    update(next) { state = next; stress = workloadStress([...next.actors.values()].filter(actor => !actor.departing).map(actor => actor.info)); wake(); },
    zap(actorId) {
      if (visible && appearance.theme === 'robots' && state?.actors.has(actorId)) {
        zaps.push({ actorId, startedAt: null, motion: {} }); wake();
      }
    },
    offerBriefing() { if (!messenger) messenger = { x: -20, y: 124, arrived: false }; wake(); },
    dismissBriefing() { messenger = null; wake(); },
    setAppearance(next) { appearance = next; if (next.theme !== 'robots') clearZaps(); wake(); },
    setNames(next) { names = next; wake(); },
    setVisible(next) {
      visible = next;
      if (next) wake();
      else {
        clearZaps();
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
      }
    },
    dispose() { clearZaps(); if (frame) cancelAnimationFrame(frame); frame = 0; visible = false; resize.disconnect(); reduced.removeEventListener('change', wake); logo.removeEventListener('load', wake); canvas.removeEventListener('click', click); },
  };
}
