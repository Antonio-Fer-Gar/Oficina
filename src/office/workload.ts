import type { AgentInfo } from '../bridge/protocol.ts';
import { isWorking } from '../state.ts';

export function workloadStress(agents: Iterable<AgentInfo>): number {
  let count = 0;
  for (const agent of agents) if (isWorking(agent)) count++;
  return Math.min(count / 8, 1);
}
