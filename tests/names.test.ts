import { expect, test } from 'bun:test';
import { actorName, catNameKey, OfficeNamesSchema, projectName, projectNameKey, RenameSchema } from '../src/office/names.ts';
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
  expect(actors.map(actor => actorName(actor, names))).toEqual(['Lince', 'Oscar', 'Antonio']);
  syncOffice(state, [{ ...first, ref: { ...first.ref, instanceId: 'restarted', generation: 'two' } }]);
  expect(actorName([...state.actors.values()][0]!, names)).toBe('Lince');
  expect(actorName([...state.actors.values()][0]!, { cats: {}, projects: {} })).toBe('Pablo');
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
