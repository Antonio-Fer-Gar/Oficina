import type { AgentInfo, AgentRef } from './bridge/protocol.ts';
import type { ConversationRecord } from './conversation.ts';

export type ConversationAction =
  | { kind: 'focus'; ref: AgentRef }
  | { kind: 'resume'; cwd: string; args: string[] }
  | { kind: 'error'; message: string };
const folder = (path: string) => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/** Never resume a conversation that may already be running; omp sessions must have a single writer. */
export function conversationAction(record: ConversationRecord, agents: readonly AgentInfo[]): ConversationAction {
  const live = agents.find(agent => !agent.parent && agent.conversation?.profile === record.profile && agent.conversation.sessionId === record.sessionId);
  if (live) return live.terminal ? { kind: 'focus', ref: live.ref } : { kind: 'error', message: 'Esta conversación sigue abierta, pero no en una consola visible.' };
  const legacy = agents.filter(agent => agent.connected === false && folder(agent.cwd) === folder(record.cwd));
  if (legacy.some(agent => agent.ref.sessionId === record.sessionId)) return { kind: 'error', message: 'Esta conversación está abierta en una consola sin conectar; búscala en la barra de tareas.' };
  if (legacy.some(agent => agent.ref.sessionId.startsWith('pid-'))) return { kind: 'error', message: 'Hay una consola sin conectar en esta carpeta que podría ser esta conversación. Ciérrala o reiníciala antes de reanudarla.' };
  if (record.availability !== 'saved' || !record.sessionFile) return { kind: 'error', message: 'Esta conversación no tiene un archivo guardado para reanudarla.' };
  return { kind: 'resume', cwd: record.cwd, args: ['--cwd', record.cwd, ...(record.profile === 'default' ? [] : ['--profile', record.profile]), '--resume', record.sessionFile] };
}
