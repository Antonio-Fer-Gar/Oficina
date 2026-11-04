import { expect, test } from 'bun:test';
import { actorName, catNameKey, moleActor, OfficeNamesSchema, projectName, projectNameKey, RenameSchema } from '../src/office/names.ts';
import { createOffice, syncOffice } from '../src/state.ts';
import type { AgentInfo } from '../src/bridge/protocol.ts';

function agent(sessionId: string, profile = 'default'): AgentInfo {
  return { ref: { instanceId: 'process-' + profile, generation: 'one', sessionId, agentId: 'main' }, parent: null,
    name: 'Session', cwd: 'C:\\Work\\Project', model: null, thinking: null, phase: 'working', activity: '',
    queued: 0, pendingAsync: false, runningChildren: 0, terminal: null,
    conversation: { profile, sessionId, project: 'Project', cwd: 'C:\\Work\\Project', title: 'Session', sessionFile: null,
      openedAt: '2026-10-29T00:00:00Z', lastActiveAt: '2026-10-29T00:00:00Z', closedAt: null } };
}

test('cat aliases survive process reconnection and do not rename another conversation or profile', () => {
  const first = agent('saved'), other = agent('other'), otherProfile = agent('saved', 'work');
  const names = OfficeNamesSchema.parse({ cats: { [catNameKey(first)]: 'Lince' }, projects: {} });
  const state = createOffice(); syncOffice(state, [first, other, otherProfile]);
  const actors = [...state.actors.values()];
  expect(actorName(actors[0]!, names)).toBe('Lince');
  syncOffice(state, [{ ...first, ref: { ...first.ref, instanceId: 'restarted', generation: 'two' } }]);
  expect(actorName([...state.actors.values()][0]!, names)).toBe('Lince');
});

test('only the earliest main agent named Pablo is the mole, including renamed agents', () => {
  const first = agent('first'), second = agent('second'), state = createOffice();
  syncOffice(state, [first, second]);
  const actors = [...state.actors.values()];
  const names = { cats: { [catNameKey(first)]: 'Pablo', [catNameKey(second)]: 'Pablo' }, projects: {} };
  expect(moleActor(actors.toReversed(), names)).toBe(actors[0]);
  names.cats[catNameKey(first)] = 'Otro nombre';
  expect(moleActor(actors, names)).toBe(actors[1]);
  names.cats[catNameKey(second)] = 'Otro nombre';
  expect(moleActor(actors, names)).toBeUndefined();
});

test('automatic main agents start with Oscar, Nono and Pablo the mole', () => {
  const state = createOffice();
  syncOffice(state, [agent('first'), agent('second'), agent('third')]);
  const actors = [...state.actors.values()], names = { cats: {}, projects: {} };
  expect(actors.map(actor => actorName(actor, names))).toEqual(['Oscar', 'Nono', 'Pablo']);
  expect(moleActor(actors, names)).toBe(actors[2]);
});

test('project names follow canonical folder identity while invalid visual names are rejected', () => {
  const first = agent('saved');
  const state = createOffice(); syncOffice(state, [first]);
  const project = [...state.projects.values()][0]!;
  const key = projectNameKey('c:/work/project/');
  const names = OfficeNamesSchema.parse({ cats: {}, projects: { [key]: 'Mesa principal' } });
  expect(projectName(project, names)).toBe('Mesa principal');
  expect(projectName({ ...project, id: projectNameKey('C:\\Other\\Project') }, names)).toBe('Project');
  expect(RenameSchema.safeParse({ kind: 'cat', key: 'saved', name: 'a'.repeat(49) }).success).toBe(false);
  expect(RenameSchema.safeParse({ kind: 'cat', key: 'saved', name: 'one\ntwo' }).success).toBe(false);
  expect(RenameSchema.parse({ kind: 'project', key, name: '  ' }).name).toBe('');
});
