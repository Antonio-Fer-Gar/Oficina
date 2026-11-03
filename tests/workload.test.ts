import { expect, test } from 'bun:test';
import type { AgentInfo } from '../src/bridge/protocol.ts';
import { workloadStress } from '../src/office/workload.ts';

function agent(id: string, phase: AgentInfo['phase'] = 'working', parent: AgentInfo['ref'] | null = null): AgentInfo {
  return { ref: { instanceId: 'process', generation: 'one', sessionId: id, agentId: id },
    parent, name: id, cwd: 'C:\\Work\\Project', model: null, thinking: null, phase, activity: '',
    queued: 0, pendingAsync: false, runningChildren: 0, terminal: null, conversation: null };
}

test('workload stress counts active children, excludes waiting and unknown agents, and saturates', () => {
  const root = agent('root', 'idle');
  const activeChild = agent('active-child', 'working', root.ref);
  const waitingChild = agent('waiting-child', 'waiting-human', root.ref);
  const unknownChild = agent('unknown-child', 'unknown', root.ref);
  const idleChild = agent('idle-child', 'idle', root.ref);

  expect(workloadStress([root, activeChild, waitingChild, unknownChild, idleChild])).toBe(0.125);
  expect(workloadStress(Array.from({ length: 8 }, (_, i) => agent(String(i))))).toBe(1);
  expect(workloadStress([])).toBe(0);
});
