import { expect, test } from 'bun:test';
import { ActivityTracker, classifyTool, resolveActivity, resolveActivityDescription } from '../src/activity.ts';
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
  expect(tools.publish(false)).toEqual({
    activity: 'Trabajando', activityKind: 'thinking', activityDescription: '',
    recentActivity: { kind: 'searching', endedAt: 2_000, description: 'Busco en la web' },
  });
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
  expect(tools.publish(false).recentActivity).toMatchObject({ kind: 'searching', endedAt: 1_000 });
});
test('ends of unknown or already finished calls change nothing', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'read', { path: 'README.md' });
  tools.end('never-started', 500);
  expect(tools.publish(false).activityKind).toBe('reading');
  tools.end('a', 1_000);
  tools.end('a', 5_000);
  expect(tools.publish(false).recentActivity).toEqual({ kind: 'reading', endedAt: 1_000, description: 'Leo README.md' });
});
test('an idle agent and a new run show nothing from earlier tools', () => {
  const tools = new ActivityTracker();
  tools.start('a', 'bash', { command: 'sleep 60' });
  expect(tools.publish(true)).toEqual({ activity: '', activityKind: 'none', activityDescription: '', recentActivity: undefined });
  tools.start('b', 'read', { path: 'README.md' });
  tools.end('b', 1_000);
  tools.clear();
  expect(tools.publish(false)).toEqual({ activity: 'Trabajando', activityKind: 'thinking', activityDescription: '', recentActivity: undefined });
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
test('snapshots serialize safe descriptions while accepting older bridges without them', () => {
  const parsed = AgentInfoSchema.parse({
    ...base, activityKind: 'reading', activityDescription: 'Leo README.md',
    recentActivity: { kind: 'searching', endedAt: 1_000, description: 'Busco referencias' },
  });
  expect(parsed).toMatchObject({
    activityKind: 'reading', activityDescription: 'Leo README.md',
    recentActivity: { kind: 'searching', endedAt: 1_000, description: 'Busco referencias' },
  });
  const child = AgentInfoSchema.parse({ ...base, parent: base.ref, activityKind: 'writing', activityDescription: 'Edito child.ts' });
  expect(child.parent).toEqual(base.ref);
  expect(child.activityDescription).toBe('Edito child.ts');
  const sanitized = AgentInfoSchema.parse({
    ...base, activityDescription: 'Ejecuto comando: npm test --token=secret',
    recentActivity: { kind: 'reading', endedAt: 1_000, description: 'Leo C:\\Users\\alice\\token.txt' },
  });
  expect(sanitized.activityDescription).toBe('');
  expect(sanitized.recentActivity?.description).toBe('');
  const oldRecent = AgentInfoSchema.parse({ ...base, recentActivity: { kind: 'reading', endedAt: 1_000 } });
  expect(oldRecent.recentActivity).toMatchObject({ kind: 'reading', endedAt: 1_000 });
  expect(oldRecent.recentActivity?.description).toBeUndefined();
  const old = AgentInfoSchema.parse({ ...base, activity: 'read' });
  expect(old.activityDescription).toBeUndefined();
  expect(resolveActivity(old, 0)).toBe('none');
  expect(resolveActivityDescription(old, 0)).toBe('');
});
test('tool descriptions expose only safe file basenames, never paths or contents', () => {
  const tools = new ActivityTracker();
  tools.start('read', 'read', { path: 'C:\\Users\\alice\\Project\\src\\renderer.ts', content: 'PRIVATE FILE CONTENT' });
  const reading = tools.publish(false);
  expect(reading.activityDescription).toBe('Leo renderer.ts');
  expect(JSON.stringify(reading)).not.toContain('C:\\Users\\alice');
  expect(JSON.stringify(reading)).not.toContain('PRIVATE FILE CONTENT');

  tools.clear();
  tools.start('edit', 'edit', { input: '[notes.txt#1A2B]\nreemplazo con contenido privado' });
  const editing = tools.publish(false);
  expect(editing.activityDescription).toBe('Edito notes.txt');
  expect(JSON.stringify(editing)).not.toContain('reemplazo con contenido privado');
});

test('unsafe, sensitive, and high-entropy filenames get generic descriptions', () => {
  const tools = new ActivityTracker();
  for (const path of [
    'C:\\Project\\.env',
    'C:\\Project\\access-token.json',
    'C:\\Project\\passwords.txt',
    'C:\\Project\\id_rsa',
    'C:\\Project\\clave.txt',
    'C:\\Project\\key.pem',
    'C:\\Project\\K8Lm3Qv7Rp2Tx9Bc5Nd1Hs4Fj6Wa0ZyE',
    'C:\\Project\\report.K8Lm3Qv7Rp2Tx9Bc5Nd1Hs4Fj6Wa0ZyE.ts',
  ]) {
    tools.clear();
    tools.start('read', 'read', { path });
    const published = tools.publish(false);
    expect(published.activityDescription).toBe('Leo un archivo');
    expect(JSON.stringify(published)).not.toContain(path.split('\\').at(-1)!);
  }
});
test('shows known command names without exposing arguments or arbitrary executables', () => {
  const tools = new ActivityTracker();
  for (const [tool, args, expected] of [
    ['grep', { pattern: 'SECRET', path: 'C:\\private' }, 'Ejecuto grep'],
    ['bash', { command: 'grep --password=SECRET archivo.txt' }, 'Ejecuto grep'],
    ['bash', { command: 'git status --short' }, 'Ejecuto git'],
    ['bash', { command: 'my-private-command --token=SECRET' }, 'Ejecuto comando'],
  ] as const) {
    tools.clear();
    tools.start('call', tool, args);
    const snapshot = tools.publish(false);
    expect(snapshot.activityDescription).toBe(expected);
    expect(JSON.stringify(snapshot)).not.toContain('SECRET');
    expect(AgentInfoSchema.parse({ ...base, ...snapshot }).activityDescription).toBe(expected);
  }
});

test('searches and commands never publish query, URL, or command arguments', () => {
  const tools = new ActivityTracker();
  tools.start('web', 'web_search', { query: 'private search phrase' });
  const search = tools.publish(false);
  expect(search.activityDescription).toBe('Busco en la web');
  expect(JSON.stringify(search)).not.toContain('private search phrase');

  tools.clear();
  tools.start('url', 'read', { path: 'https://example.com/private?q=secret#fragment' });
  const url = tools.publish(false);
  expect(url.activityDescription).toBe('Consulto la web');
  expect(JSON.stringify(url)).not.toContain('private?q=secret#fragment');

  tools.clear();
  tools.start('url-write', 'write', { path: 'https://secret.example/private?token=hidden#fragment', content: 'private write' });
  const urlWrite = tools.publish(false);
  expect(urlWrite.activityDescription).toBe('Escribo un archivo');
  expect(JSON.stringify(urlWrite)).not.toContain('https://secret.example');

  tools.clear();
  tools.start('cmd', 'bash', { command: 'printf "PRIVATE COMMAND CONTENT"' });
  const command = tools.publish(false);
  expect(command.activityDescription).toBe('Ejecuto comando');
  expect(JSON.stringify(command)).not.toContain('PRIVATE COMMAND CONTENT');

  tools.clear();
  tools.start('test', 'bash', { command: 'bun test tests/activity.test.ts --secret=hidden' });
  const testCommand = tools.publish(false);
  expect(testCommand.activityDescription).toBe('Ejecuto pruebas');
  expect(JSON.stringify(testCommand)).not.toContain('--secret=hidden');
  tools.clear();
  tools.start('nested', 'write', { path: 'xd://write', content: 'secret implementation detail' });
  expect(tools.publish(false).activityDescription).toBe('Escribo un archivo');
});

test('skill descriptions include only safe names from skill resources', () => {
  const tools = new ActivityTracker();
  tools.start('skill', 'read', { path: 'skill://brainstorming/SKILL.md' });
  expect(tools.publish(false).activityDescription).toBe('Consulto skill: brainstorming');

  tools.clear();
  tools.start('skill-file', 'read', { path: 'C:\\repo\\.agents\\skills\\test-driven-development\\SKILL.md' });
  const skillFile = tools.publish(false);
  expect(skillFile.activityDescription).toBe('Consulto skill: test-driven-development');
  expect(JSON.stringify(skillFile)).not.toContain('C:\\repo');

  tools.clear();
  tools.start('unsafe-skill', 'read', { path: 'skill://private-token-name/SKILL.md' });
  expect(tools.publish(false).activityDescription).toBe('Leo un archivo');
});

test('activity descriptions follow active-tool precedence and recent-action expiry', () => {
  const tools = new ActivityTracker();
  tools.start('read', 'read', { path: 'README.md' });
  tools.end('read', 1_000);
  const recent = tools.publish(false);
  const working = { phase: 'working' as const, ...recent };
  expect(resolveActivityDescription(working, 999)).toBe('');
  expect(resolveActivityDescription(working, 2_500)).toBe('Leo README.md');
  expect(resolveActivityDescription(working, 2_501)).toBe('');

  tools.start('test', 'bash', { command: 'npm test' });
  const active = { phase: 'working' as const, ...tools.publish(false) };
  expect(resolveActivityDescription(active, 1_001)).toBe('Ejecuto pruebas');
  for (const phase of ['idle', 'stopped', 'unknown', 'waiting-human', 'asking-parent'] as const) {
    expect(resolveActivityDescription({ ...active, phase }, 1_001)).toBe('');
  }
});
