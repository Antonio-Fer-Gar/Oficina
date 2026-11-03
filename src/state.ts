import type { AgentInfo, AgentRef } from './bridge/protocol.ts';
export interface Project {
  id: string; name: string; cwd: string; x: number; installed: boolean;
  carrier: string | null; seat: string | null; queue: string[]; members: string[];
}
export interface Actor {
  id: string; info: AgentInfo; project: string; x: number; y: number;
  stage: 'fetch' | 'drag' | 'approach' | 'waiting' | 'seated' | 'coffee' | 'attention' | 'consult';
  arrived: number | null; moving: boolean; order: number;
  sofaSlot: 0 | 1 | null;
  /** Time the actor reaches the coffee queue; seats are assigned by this arrival time. */
  sofaArrival: number | null;
  /** Cats only: index into the name list; the lowest free one, so names are reused after a cat leaves. */
  nameIndex: number;
}
export interface OfficeState {
  actors: Map<string, Actor>; projects: Map<string, Project>; width: number; height: number; roomWidth: number;
  scale: number; time: number; serial: number;
}
export function agentKey(ref: AgentRef): string {
  return JSON.stringify([ref.instanceId, ref.generation, ref.sessionId, ref.agentId]);
}
export function createOffice(): OfficeState {
  return { actors: new Map(), projects: new Map(), width: 1000, height: 180, roomWidth: 210, scale: 1, time: 0, serial: 0 };
}
export function isWorking(info: AgentInfo): boolean {
  return info.phase === 'working' || (info.phase === 'idle' && (info.pendingAsync || info.queued > 0 || info.runningChildren > 0));
}
const SOFA_X = [38, 68] as const, SOFA_Y = 82;
const COFFEE_WAIT_X = 126, COFFEE_WAIT_GAP = 44, COFFEE_COLUMNS = 3, COFFEE_GROUP_SIZE = COFFEE_COLUMNS * 2,
  COFFEE_ROW_GAP = 51;
function clearSofa(actor: Actor): void {
  actor.sofaSlot = null; actor.sofaArrival = null;
}
function assignSofaSlots(state: OfficeState): void {
  const occupied = [false, false], waiting: Actor[] = [];
  for (const actor of state.actors.values()) {
    if (actor.stage !== 'coffee') continue;
    if (actor.sofaSlot === null) {
      if (actor.sofaArrival !== null) waiting.push(actor);
    } else occupied[actor.sofaSlot] = true;
  }
  waiting.sort((a, b) => a.sofaArrival! - b.sofaArrival! || a.order - b.order);
  for (const actor of waiting) {
    const slot: 0 | 1 = occupied[0] ? 1 : 0;
    if (occupied[slot]) break;
    actor.sofaSlot = slot; occupied[slot] = true;
    actor.moving = Math.hypot(SOFA_X[slot] - actor.x, SOFA_Y - actor.y) > 0.5;
  }
}
function release(project: Project, id: string) {
  if (project.seat === id) project.seat = null;
  const index = project.queue.indexOf(id);
  if (index >= 0) project.queue.splice(index, 1);
}
export function syncOffice(state: OfficeState, agents: AgentInfo[]): void {
  const current = new Set(agents.map(agent => agentKey(agent.ref)));
  for (const [id, actor] of state.actors) {
    if (current.has(id)) continue;
    const project = state.projects.get(actor.project);
    if (project) { release(project, id); if (project.carrier === id) project.carrier = null; }
    state.actors.delete(id);
  }
  for (const project of state.projects.values()) project.members = [];
  for (const info of agents) {
    const id = agentKey(info.ref), key = info.cwd.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    let project = state.projects.get(key);
    if (!project) {
      project = { id: key, name: info.conversation?.project ?? info.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? info.cwd, cwd: info.cwd, x: 260, installed: false, carrier: null, seat: null, queue: [], members: [] };
      state.projects.set(key, project);
    }
    project.members.push(id);
    let actor = state.actors.get(id);
    if (actor && actor.project !== key) {
      const old = state.projects.get(actor.project);
      if (old) release(old, id);
      state.actors.delete(id); actor = undefined;
    }
    if (!actor) {
      const parent = info.parent ? state.actors.get(agentKey(info.parent)) : undefined;
      let nameIndex = -1;
      if (!info.parent) {
        const taken = new Set([...state.actors.values()].map(other => other.nameIndex));
        nameIndex = 0;
        while (taken.has(nameIndex)) nameIndex++;
      }
      actor = { id, info, project: key, x: parent ? parent.x + 18 : 62, y: parent ? Math.min(parent.y + 18, 135) : 120,
        stage: 'approach', arrived: null, moving: false, order: state.serial++, sofaSlot: null, sofaArrival: null, nameIndex };
      state.actors.set(id, actor);
    }
    actor.info = info;
    if (project.carrier === id) continue; // Delivering the desk finishes first; phase applies on arrival.
    const resting = restingStage(info);
    if (resting) {
      if (resting !== 'coffee' || actor.stage !== 'coffee') clearSofa(actor);
      release(project, id); actor.arrived = null; actor.stage = resting;
    } else if (actor.stage === 'coffee' || actor.stage === 'attention' || actor.stage === 'consult') {
      clearSofa(actor); actor.stage = 'approach'; actor.arrived = null;
    }
  }
  const resting = agents.filter(info => restingStage(info) === 'coffee').length;
  const last = Math.max(resting - 1, 0), group = Math.floor(last / COFFEE_GROUP_SIZE), within = last % COFFEE_GROUP_SIZE;
  const rightmost = resting ? COFFEE_WAIT_X + group * COFFEE_COLUMNS * COFFEE_WAIT_GAP +
    Math.min(within, COFFEE_COLUMNS - 1) * COFFEE_WAIT_GAP + 25 : 210;
  state.roomWidth = Math.max(210, rightmost);
  let x = state.roomWidth + 50;
  for (const [key, project] of state.projects) {
    if (!project.members.length) { state.projects.delete(key); continue; }
    project.x = x;
    x += Math.max(155, (project.members.length - 1) * 24 + 100);
    if (!project.installed && !project.carrier) {
      const carrier = project.members.map(id => state.actors.get(id)!).find(actor => !actor.info.parent);
      if (carrier) { project.carrier = carrier.id; carrier.stage = 'fetch'; }
      else project.installed = true; // Only subagents here: no cat to carry the desk.
    }
  }
  state.width = Math.max(1000, x + 200);
  state.scale = Math.min(1, 1000 / state.width);
  assignSofaSlots(state);
}
function restingStage(info: AgentInfo): Actor['stage'] | null {
  if (info.phase === 'waiting-human') return 'attention';
  if (info.phase === 'asking-parent') return 'consult';
  return isWorking(info) ? null : 'coffee';
}
function move(actor: Actor, x: number, y: number, dt: number): boolean {
  const dx = x - actor.x, dy = y - actor.y, distance = Math.hypot(dx, dy);
  const step = Math.min(distance, dt * 85);
  actor.moving = distance > 0.5;
  if (distance > 0) { actor.x += dx / distance * step; actor.y += dy / distance * step; }
  return distance <= step + 0.5;
}
export function advanceOffice(state: OfficeState, dt: number): void {
  state.time += dt;
  const coffeeWaiters = [...state.actors.values()]
    .filter(actor => actor.stage === 'coffee' && actor.sofaSlot === null)
    .sort((a, b) => a.order - b.order);
  const coffeeWaitIndex = new Map<Actor, number>();
  coffeeWaiters.forEach((actor, index) => coffeeWaitIndex.set(actor, index));
  for (const actor of state.actors.values()) {
    const project = state.projects.get(actor.project)!;
    actor.moving = false;
    if (actor.stage === 'fetch') {
      if (move(actor, 111, 118, dt)) actor.stage = 'drag';
    } else if (actor.stage === 'drag') {
      if (move(actor, project.x + 28, 122, dt)) { project.installed = true; project.carrier = null; actor.stage = restingStage(actor.info) ?? 'approach'; }
    } else if (actor.stage === 'coffee') {
      if (actor.sofaSlot !== null) move(actor, SOFA_X[actor.sofaSlot], SOFA_Y, dt);
      else {
        const index = coffeeWaitIndex.get(actor)!;
        const group = Math.floor(index / COFFEE_GROUP_SIZE), within = index % COFFEE_GROUP_SIZE;
        const x = COFFEE_WAIT_X + group * COFFEE_COLUMNS * COFFEE_WAIT_GAP +
          (within % COFFEE_COLUMNS) * COFFEE_WAIT_GAP;
        const y = 83 + Math.floor(within / COFFEE_COLUMNS) * COFFEE_ROW_GAP;
        const distance = Math.hypot(x - actor.x, y - actor.y);
        if (move(actor, x, y, dt) && actor.sofaArrival === null) {
          actor.sofaArrival = state.time - dt + distance / 85;
        }
      }
    } else if (actor.stage === 'attention') {
      move(actor, state.width - 130 - actor.order % 3 * 22, 113, dt);
    } else if (actor.stage === 'consult') {
      const parent = actor.info.parent ? state.actors.get(agentKey(actor.info.parent)) : undefined;
      move(actor, parent ? parent.x - 24 : project.x, parent ? Math.min(parent.y + 8, 135) : 120, dt);
    } else {
      if (project.seat === actor.id) {
        actor.stage = 'seated'; move(actor, project.x, 101, dt);
      } else if (actor.arrived !== null) {
        actor.stage = 'waiting';
        const index = Math.max(0, project.queue.indexOf(actor.id));
        move(actor, project.x - 48 - index * 23, 119, dt);
      } else {
        const distance = Math.hypot(project.x + 45 - actor.x, 122 - actor.y);
        if (move(actor, project.x + 45, 122, dt)) actor.arrived = state.time - dt + distance / 85;
      }
    }
  }
  for (const project of state.projects.values()) {
    if (!project.installed) continue;
    const arrived = project.members.map(id => state.actors.get(id)!)
      .filter(actor => actor.arrived !== null && isWorking(actor.info) && project.seat !== actor.id && !project.queue.includes(actor.id))
      .sort((a, b) => a.arrived! - b.arrived! || a.order - b.order);
    project.queue.push(...arrived.map(actor => actor.id));
    if (!project.seat && project.queue.length) project.seat = project.queue.shift()!;
  }
  assignSofaSlots(state);
}
