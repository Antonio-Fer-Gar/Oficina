import { describe, expect, test } from 'bun:test';
import { advanceOffice, createOffice, syncOffice, agentKey } from '../src/state.ts';
import type { AgentInfo } from '../src/bridge/protocol.ts';
function agent(id: string, parent: AgentInfo | null = null): AgentInfo {
  return { ref: { instanceId: 'process', generation: 'one', sessionId: id, agentId: id },
    parent: parent?.ref ?? null, name: id, cwd: 'C:\\Work\\Project', model: null, thinking: null,
    phase: 'working', activity: 'editing', queued: 0, pendingAsync: false, runningChildren: 0,
    terminal: null, conversation: null };
}
function walk(state: ReturnType<typeof createOffice>, seconds = 8) {
  for (let t = 0; t < seconds; t += 0.05) advanceOffice(state, 0.05);
}
function sofaQueue() {
  const infos = ['sofa-a', 'sofa-b', 'sofa-c', 'sofa-d'].map(id => agent(id));
  const state = createOffice();
  syncOffice(state, infos); walk(state, 40);
  const actors = infos.map(info => state.actors.get(agentKey(info.ref))!);
  [[0, 0], [169, 83], [213.5, 83], [126, 134]].forEach(([x, y], index) => {
    actors[index]!.x = x!; actors[index]!.y = y!;
  });
  const idle = infos.map(info => ({ ...info, phase: 'idle' as const }));
  syncOffice(state, [idle[0]!, idle[3]!, idle[2]!, idle[1]!]);
  advanceOffice(state, 0.05);
  return { state, infos, idle, actors };
}
describe('office shared project chairs', () => {
  test('root and children share one desk; waiting workers inherit the chair FIFO', () => {
    const root = agent('Main'); const state = createOffice(); syncOffice(state, [root]); walk(state);
    const child = agent('child', root), next = agent('next', root);
    syncOffice(state, [root, child, next]); walk(state);
    expect(state.projects.size).toBe(1);
    const project = [...state.projects.values()][0]!;
    expect(project.seat).toBe(agentKey(root.ref));
    syncOffice(state, [{ ...root, phase: 'idle' }, child, next]); walk(state);
    expect(project.seat).toBe(agentKey(child.ref));
    syncOffice(state, [{ ...root, phase: 'working' }, { ...child, phase: 'waiting-human' }, next]); walk(state);
    expect(project.seat).toBe(agentKey(next.ref));
    expect(project.queue).toEqual([agentKey(root.ref)]);
  });
  test('case variants share a Windows project, and async work does not release its chair', () => {
    const root = agent('Main'), second = { ...agent('Other'), cwd: 'c:\\work\\project\\' };
    const state = createOffice(); syncOffice(state, [root, second]); walk(state);
    expect(state.projects.size).toBe(1);
    const first = [...state.projects.values()][0]!.seat;
    expect(first).not.toBeNull();
    syncOffice(state, [root, second].map(info => agentKey(info.ref) === first ? { ...info, phase: 'idle', pendingAsync: true } : info)); walk(state);
    expect([...state.projects.values()][0]!.seat).toBe(first);
  });
  test('closed or restarted agents cannot retain a chair or consult the wrong generation', () => {
    const root = agent('Main'), child = agent('child', root);
    const state = createOffice(); syncOffice(state, [root, child]); walk(state);
    syncOffice(state, [child]); walk(state);
    expect([...state.projects.values()][0]!.seat).toBe(agentKey(child.ref));
    const restarted = { ...root, ref: { ...root.ref, generation: 'two' } };
    syncOffice(state, [restarted]); walk(state);
    expect(state.actors.has(agentKey(root.ref))).toBe(false);
    expect([...state.projects.values()][0]!.seat).toBe(agentKey(restarted.ref));
  });
  test('an idle first cat still delivers one desk, and a closed carrier hands the same delivery to another cat', () => {
    const state = createOffice();
    const first = { ...agent('First'), phase: 'idle' as const }, second = { ...agent('Second'), phase: 'idle' as const };
    syncOffice(state, [first, second]); advanceOffice(state, 0.5);
    const project = [...state.projects.values()][0]!;
    expect(project.carrier).toBe(agentKey(first.ref));
    syncOffice(state, [second]);
    expect(project.carrier).toBe(agentKey(second.ref));
    walk(state, 12);
    expect(state.projects.size).toBe(1);
    expect(project.installed).toBe(true);
    expect(state.actors.get(agentKey(second.ref))!.stage).toBe('coffee');
    expect(project.seat).toBeNull();
  });
  test('the final console returns its installed desk and then removes its courier', () => {
    const root = agent('Main'), state = createOffice();
    syncOffice(state, [root]); walk(state, 12);
    const project = [...state.projects.values()][0]!;
    const id = agentKey(root.ref);
    syncOffice(state, []);
    expect(project.installed).toBe(true);
    expect(project.carrier).toBe(id);
    expect(state.actors.get(id)?.stage).toBe('return-fetch');
    walk(state);
    expect(state.actors.has(id)).toBe(false);
    expect(state.projects.has(project.id)).toBe(false);
  });
  test('a remaining console keeps the shared desk instead of returning it', () => {
    const first = agent('First'), second = agent('Second'), state = createOffice();
    syncOffice(state, [first, second]); walk(state, 12);
    const project = [...state.projects.values()][0]!;
    syncOffice(state, [second]);
    expect(state.actors.has(agentKey(first.ref))).toBe(false);
    expect(project.installed).toBe(true);
    expect(project.carrier).toBeNull();
    expect(state.actors.get(agentKey(second.ref))?.stage).not.toBe('return-fetch');
  });
  test('closing during incoming desk transport sends the carried desk back', () => {
    const root = agent('Main'), state = createOffice();
    syncOffice(state, [root]);
    const id = agentKey(root.ref), project = [...state.projects.values()][0]!;
    advanceOffice(state, 0.9);
    expect(state.actors.get(id)?.stage).toBe('drag');
    syncOffice(state, []);
    expect(state.actors.get(id)?.stage).toBe('return');
    walk(state);
    expect(state.actors.has(id)).toBe(false);
    expect(state.projects.has(project.id)).toBe(false);
  });
  test('reopening a project during desk return reverses the courier and keeps the desk', () => {
    const root = agent('Main'), state = createOffice();
    syncOffice(state, [root]); walk(state, 12);
    const project = [...state.projects.values()][0]!;
    const id = agentKey(root.ref), reopened = agent('Reopened');
    syncOffice(state, []);
    expect(state.actors.get(id)?.stage).toBe('return-fetch');
    advanceOffice(state, 1);
    expect(state.actors.get(id)?.stage).toBe('return');
    expect(project.installed).toBe(false);
    syncOffice(state, [reopened]);
    expect(project.carrier).toBe(id);
    expect(state.actors.get(id)?.stage).toBe('drag');
    walk(state);
    expect(state.actors.has(id)).toBe(false);
    expect(project.installed).toBe(true);
    expect(state.projects.has(project.id)).toBe(true);
  });
  test('reopening before pickup keeps the installed desk and drops its courier', () => {
    const root = agent('Main'), state = createOffice();
    syncOffice(state, [root]); walk(state, 12);
    const project = [...state.projects.values()][0]!, id = agentKey(root.ref), reopened = agent('Reopened');
    syncOffice(state, []);
    expect(state.actors.get(id)?.stage).toBe('return-fetch');
    syncOffice(state, [reopened]);
    expect(project.installed).toBe(true);
    expect(project.carrier).toBeNull();
    expect(state.actors.has(id)).toBe(false);
    expect(project.members).toEqual([agentKey(reopened.ref)]);
  });
  test('simultaneous console closures use one courier for the shared desk', () => {
    const first = agent('First'), second = agent('Second'), state = createOffice();
    syncOffice(state, [first, second]); walk(state, 12);
    const project = [...state.projects.values()][0]!;
    syncOffice(state, []);
    expect([...state.actors.values()].filter(actor => actor.departing)).toHaveLength(1);
    walk(state);
    expect(state.actors.size).toBe(0);
    expect(state.projects.has(project.id)).toBe(false);
  });
  test('an orphaned subagent keeps the desk until it is the final project member', () => {
    const root = agent('Main'), child = agent('orphan', root), state = createOffice();
    syncOffice(state, [root, child]); walk(state, 12);
    const project = [...state.projects.values()][0]!;
    syncOffice(state, [child]);
    expect(project.installed).toBe(true);
    syncOffice(state, []);
    expect(state.actors.get(agentKey(child.ref))?.stage).toBe('return-fetch');
    walk(state);
    expect(state.projects.has(project.id)).toBe(false);
  });
  test('incomplete inventory does not close a console or start desk return', () => {
    const root = agent('Main'), state = createOffice();
    syncOffice(state, [root]); walk(state, 12);
    const project = [...state.projects.values()][0]!, id = agentKey(root.ref);
    syncOffice(state, [], false);
    expect(state.actors.get(id)?.departing).toBe(false);
    expect(project.installed).toBe(true);
    expect(project.members).toEqual([id]);
    syncOffice(state, []);
    expect(state.actors.get(id)?.stage).toBe('return-fetch');
  });
  test('cats take the first free name, mice do not consume names, and a freed name is reused', () => {
    const state = createOffice();
    const a = agent('A'), mouse = agent('mouse', a), b = agent('B'), c = agent('C');
    syncOffice(state, [a, mouse, b]);
    const index = (info: AgentInfo) => state.actors.get(agentKey(info.ref))!.nameIndex;
    expect([index(a), index(b)]).toEqual([0, 1]);
    expect(index(mouse)).toBe(-1);
    syncOffice(state, [b]);
    syncOffice(state, [b, c]);
    expect(index(c)).toBe(0);
  });
  test('expanding projects uniformly reduces scale without growing the window', () => {
    const state = createOffice();
    const agents = Array.from({ length: 12 }, (_, i) => ({ ...agent(String(i)), cwd: 'C:\\Work\\project-' + i }));
    syncOffice(state, agents); walk(state, 40);
    expect(state.scale).toBeLessThan(1);
    expect(state.height).toBe(180);
    expect([...state.projects.values()].every(project => project.x < state.width - 100)).toBe(true);
    expect([...state.actors.values()].every(actor => actor.x >= 0 && actor.x <= state.width)).toBe(true);
  });
  test('a crowded waiting room reserves space before the first project desk', () => {
    const state = createOffice();
    const agents = Array.from({ length: 20 }, (_, i) => ({ ...agent(String(i)), phase: 'idle' as const, cwd: 'C:\\Work\\waiting-' + i }));
    syncOffice(state, agents); walk(state, 120);
    const firstDesk = Math.min(...[...state.projects.values()].map(project => project.x));
    const lastResident = Math.max(...[...state.actors.values()].map(actor => actor.x));
    expect([...state.actors.values()].every(actor => actor.stage === 'coffee' && !actor.moving)).toBe(true);
    expect(lastResident + 20).toBeLessThan(firstDesk - 31);
  });
});
describe('office sofa seats', () => {
  test('the first physical arrivals get seats despite inventory refresh order, without teleporting', () => {
    const { state, idle, actors } = sofaQueue();
    expect([actors[3]!.sofaSlot, actors[2]!.sofaSlot]).toEqual([0, 1]);
    expect([actors[0]!.sofaSlot, actors[1]!.sofaSlot]).toEqual([null, null]);
    expect([actors[3]!.x, actors[3]!.y]).toEqual([126, 134]);

    syncOffice(state, idle);
    expect([actors[3]!.sofaSlot, actors[2]!.sofaSlot]).toEqual([0, 1]);
    walk(state, 3);
    expect(actors[3]!.moving || actors[2]!.moving).toBe(false);
  });
  test('activity frees the sofa slot for the earliest arrived waiter', () => {
    const { state, idle, infos, actors } = sofaQueue();
    const activeC = { ...infos[2]!, phase: 'working' as const };
    syncOffice(state, [idle[0]!, idle[1]!, activeC, idle[3]!]);
    expect(actors[2]!.sofaSlot).toBeNull();
    expect(actors[3]!.sofaSlot).toBe(0);
    expect(actors[1]!.sofaSlot).toBe(1);
  });
  test('removing a seated actor frees its sofa slot for the earliest arrived waiter', () => {
    const { state, idle, actors } = sofaQueue();
    syncOffice(state, [idle[0]!, idle[1]!, idle[2]!]);
    expect(state.actors.has(actors[3]!.id)).toBe(false);
    expect(actors[1]!.sofaSlot).toBe(0);
    expect(actors[2]!.sofaSlot).toBe(1);
  });
  test('more than two residents wait in distinct positions without overlapping sofa occupants', () => {
    const infos = Array.from({ length: 8 }, (_, index) => agent('resident-' + index));
    const state = createOffice();
    syncOffice(state, infos.map(info => ({ ...info, phase: 'idle' as const })));
    walk(state, 40);
    const actors = [...state.actors.values()];
    const seated = actors.filter(actor => actor.sofaSlot !== null);
    const waiting = actors.filter(actor => actor.stage === 'coffee' && actor.sofaSlot === null);
    expect(actors.every(actor => actor.stage === 'coffee' && !actor.moving)).toBe(true);
    expect(seated.map(actor => actor.sofaSlot).sort()).toEqual([0, 1]);
    expect(waiting).toHaveLength(6);
    for (let i = 0; i < waiting.length; i++) for (let j = i + 1; j < waiting.length; j++) {
      expect(Math.abs(waiting[i]!.x - waiting[j]!.x) >= 38 ||
        Math.abs(waiting[i]!.y - waiting[j]!.y) >= 51).toBe(true);
    }
    for (const waiter of waiting) for (const sitter of seated) {
      expect(Math.abs(waiter.x - sitter.x) >= 38 ||
        Math.abs(waiter.y - sitter.y) >= 51).toBe(true);
    }
  });
});
