import { expect, test } from 'bun:test';
import { ActivityTracker, classifyTool, resolveActivity } from '../src/activity.ts';
import { AgentInfoSchema, type AgentInfo } from '../src/bridge/protocol.ts';

const base: AgentInfo = {
  ref: { instanceId: 'process', generation: 'one', sessionId: 'session', agentId: 'Main' },
  parent: null, name: 'Gato', cwd: 'C:\\Project', model: null, thinking: null, phase: 'working', activity: '',
  queued: 0, pendingAsync: false, runningChildren: 0, terminal: null, conversation: null,
};
/** What the office draws for a working agent whose bridge publishes these tools. */
function shown(tools: ActivityTracker, now: number) {
  return resolveActivity({ phase: 'working', ...tools.publish(false) }, now);
}

test('tool calls map to the action they really perform', () => {
  expect(classifyTool('read', { path: 'C:\\Project\\README.md' })).toBe('reading');
  expect(classifyTool('read', { path: 'https://example.com/docs' })).toBe('searching');
  expect(classifyTool('read', { path: 'HTTP://example.com' })).toBe('searching');
  for (const name of ['web_search', 'browser', 'search', 'glob', 'grep']) expect(classifyTool(name, { pattern: 'cat' })).toBe('searching');
  for (const name of ['write', 'edit', 'ast_edit']) expect(classifyTool(name, { path: 'notes.txt' })).toBe('writing');
  for (const name of ['bash', 'eval', 'debug']) expect(classifyTool(name, {})).toBe('executing');
  expect(classifyTool('task', { tasks: [] })).toBe('coordinating');
});
test('namespaced or differently cased tool names classify by the tool itself', () => {
  expect(classifyTool('functions.read', { path: 'src/main.ts' })).toBe('reading');
  expect(classifyTool('mcp__brave__brave_web_search', { query: 'cats' })).toBe('searching');
  expect(classifyTool('default_api:Bash', { command: 'ls' })).toBe('executing');
});
test('writing to an agent or a tool device takes the action of its target', () => {
  expect(classifyTool('write', { path: 'agent://Main' })).toBe('coordinating');
  expect(classifyTool('write', { path: 'xd://ast_edit' })).toBe('writing');
  expect(classifyTool('write', { path: 'xd://debug' })).toBe('executing');
});
test('unrecognized tools only mean the agent is thinking', () => {
  expect(classifyTool('todo', { ops: [] })).toBe('thinking');
  expect(classifyTool('ask', { questions: [] })).toBe('thinking');
  // An object-property name must not leak a non-kind into the published snapshot.
  expect(classifyTool('constructor', undefined)).toBe('thinking');
});

test('parallel tools finishing out of order never leave a finished action behind', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'read', { path: 'README.md' });
  tools.start('b', 'web_search', { query: 'cats' });
  tools.end('a', 1_000);
  expect(tools.publish(false)).toMatchObject({ activity: 'web_search', activityKind: 'searching' });
  tools.end('b', 2_000);
  expect(tools.publish(false)).toEqual({ activity: 'Trabajando', activityKind: 'thinking', recentActivity: { kind: 'searching', endedAt: 2_000 } });
  expect(shown(tools, 3_501)).toBe('thinking');
});
test('a running tool takes precedence over the completion of another', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'bash', { command: 'bun test' });
  tools.start('b', 'read', { path: 'README.md' });
  expect(shown(tools, 0)).toBe('reading');
  tools.end('b', 1_000);
  expect(shown(tools, 1_000)).toBe('executing');
});
test('a quick tool stays visible at most 1.5 s after it ends while the agent keeps working', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'edit', { input: '[notes.txt#1A2B]' });
  tools.end('a', 10_000);
  expect(shown(tools, 10_000)).toBe('writing');
  expect(shown(tools, 11_500)).toBe('writing');
  expect(shown(tools, 11_501)).toBe('thinking');
});
test('an unrecognized tool neither hides nor replaces a real action', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'grep', { pattern: 'cat' });
  tools.start('b', 'todo', { ops: [] });
  expect(tools.publish(false)).toMatchObject({ activity: 'grep', activityKind: 'searching' });
  tools.end('a', 1_000);
  tools.end('b', 1_100);
  expect(tools.publish(false).recentActivity).toEqual({ kind: 'searching', endedAt: 1_000 });
});
test('ends of unknown or already finished calls change nothing', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'read', { path: 'README.md' });
  tools.end('never-started', 500);
  expect(tools.publish(false).activityKind).toBe('reading');
  tools.end('a', 1_000);
  tools.end('a', 5_000);
  expect(tools.publish(false).recentActivity).toEqual({ kind: 'reading', endedAt: 1_000 });
});
test('an idle agent and a new run show nothing from earlier tools', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'bash', { command: 'sleep 60' });
  expect(tools.publish(true)).toEqual({ activity: '', activityKind: 'none', recentActivity: undefined });
  tools.start('b', 'read', { path: 'README.md' });
  tools.end('b', 1_000);
  tools.clear();
  expect(tools.publish(false)).toEqual({ activity: 'Trabajando', activityKind: 'thinking', recentActivity: undefined });
  expect(shown(tools, 1_001)).toBe('thinking');
});

test('only a working agent shows an action', () => {
  const fresh = { kind: 'reading' as const, endedAt: 1_000 };
  for (const phase of ['idle', 'stopped', 'unknown', 'waiting-human', 'asking-parent'] as const) {
    expect(resolveActivity({ ...base, phase, activityKind: 'searching', recentActivity: fresh }, 1_000)).toBe('none');
  }
  expect(resolveActivity({ ...base, activityKind: 'searching', recentActivity: fresh }, 1_000)).toBe('searching');
});
test('a just-finished action shows while nothing runs, then expires', () => {
  const recentActivity = { kind: 'coordinating' as const, endedAt: 1_000 };
  expect(resolveActivity({ ...base, activityKind: 'none', recentActivity }, 2_500)).toBe('coordinating');
  expect(resolveActivity({ ...base, activityKind: 'none', recentActivity }, 2_501)).toBe('none');
  expect(resolveActivity({ ...base, activityKind: 'thinking', recentActivity }, 999)).toBe('thinking');
});
test('snapshots keep structured activity, and bridges without it show no action despite stale text', () => {
  const parsed = AgentInfoSchema.parse({ ...base, activityKind: 'reading', recentActivity: { kind: 'searching', endedAt: 1_000 } });
  expect(parsed).toMatchObject({ activityKind: 'reading', recentActivity: { kind: 'searching', endedAt: 1_000 } });
  const old = AgentInfoSchema.parse({ ...base, activity: 'read' });
  expect(resolveActivity(old, 0)).toBe('none');
});
