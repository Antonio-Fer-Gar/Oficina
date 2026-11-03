import { expect, test } from 'bun:test';
import { conversationAction } from '../src/resume.ts';
import type { AgentInfo } from '../src/bridge/protocol.ts';
import type { ConversationRecord } from '../src/conversation.ts';

const record: ConversationRecord = { profile: 'work', sessionId: 'abc', project: 'Project', cwd: 'C:\\Work\\Project',
  title: 'Chat', sessionFile: 'C:\\Sessions\\x_abc.jsonl', openedAt: '2026-10-29T00:00:00Z', lastActiveAt: '2026-10-29T00:00:00Z',
  closedAt: '2026-10-29T01:00:00Z', availability: 'saved' };
const base = { parent: null, name: 'Main', cwd: 'C:\\Work\\Project', model: null, thinking: null, phase: 'idle' as const, activity: '',
  queued: 0, pendingAsync: false, runningChildren: 0, terminal: null, conversation: null };
function live(profile: string, terminal = true): AgentInfo {
  return { ...base, ref: { instanceId: 'i', generation: 'g', sessionId: 'abc', agentId: 'main' },
    terminal: terminal ? { pid: 10, startedAt: '2026-10-29T00:00:00Z', kind: 'classic', marker: 'nter-12345678' } : null,
    conversation: { ...record, profile, closedAt: null } };
}
const legacy = (sessionId: string, cwd = 'c:/work/project/'): AgentInfo =>
  ({ ...base, cwd, connected: false, ref: { instanceId: 'legacy', generation: '1', sessionId, agentId: 'console-1' } });

test('an open conversation is focused instead of resumed, but only for the same profile', () => {
  expect(conversationAction(record, [live('work')])).toMatchObject({ kind: 'focus' });
  expect(conversationAction(record, [live('work', false)])).toMatchObject({ kind: 'error' });
  expect(conversationAction(record, [live('default')])).toEqual({ kind: 'resume', cwd: 'C:\\Work\\Project', args: ['--cwd', 'C:\\Work\\Project', '--profile', 'work', '--resume', 'C:\\Sessions\\x_abc.jsonl'] });
});

test('possible duplicates in unconnected consoles and unsaved sessions are refused', () => {
  expect(conversationAction(record, [legacy('abc')])).toMatchObject({ kind: 'error' });
  expect(conversationAction(record, [legacy('pid-77')])).toMatchObject({ kind: 'error' });
  expect(conversationAction(record, [legacy('other')])).toMatchObject({ kind: 'resume' });
  expect(conversationAction(record, [legacy('pid-77', 'C:\\Elsewhere')])).toMatchObject({ kind: 'resume' });
  expect(conversationAction({ ...record, availability: 'missing' }, [])).toMatchObject({ kind: 'error' });
  expect(conversationAction({ ...record, profile: 'default' }, [])).toMatchObject({ kind: 'resume', args: ['--cwd', record.cwd, '--resume', record.sessionFile] });
});
