import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridgeServer, requestBridge } from '../src/bridge/pipe.ts';
import type { AgentInfo } from '../src/bridge/protocol.ts';
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function registry() { const path = mkdtempSync(join(tmpdir(), 'nter-pipe-test-')); directories.push(path); return path; }
const agent: AgentInfo = {
  ref: { instanceId: 'instance', generation: 'current', sessionId: 'session', agentId: 'Main' },
  parent: null, name: 'Agent', cwd: 'C:\\Project', model: null, thinking: null, phase: 'idle', activity: '', queued: 0,
  pendingAsync: false, runningChildren: 0, terminal: null, conversation: null,
};
test('an unauthenticated client cannot obtain agents or dispatch a command', async () => {
  let unauthorizedAction = false;
  const server = await createBridgeServer({ registryDir: registry(), instanceId: 'instance', generation: 'current', agents: () => [agent], dispatch: async command => { unauthorizedAction = true; return { id: command.id, ok: true, status: 'applied' }; } });
  try {
    const response = await requestBridge({ ...server.descriptor, token: 'wrong' }, { type: 'snapshot' });
    expect(response).toEqual({ type: 'error', code: 'unauthorized', message: 'Unauthorized' });
    expect(JSON.stringify(response)).not.toContain('C:\\Project');
    expect(unauthorizedAction).toBe(false);
  } finally { await server.close(); }
});
test('an old generation cannot apply an action to a replacement session', async () => {
  let changed = false;
  const server = await createBridgeServer({ registryDir: registry(), instanceId: 'instance', generation: 'current', agents: () => [agent], dispatch: async command => { changed = true; return { id: command.id, ok: true, status: 'applied' }; } });
  try {
    const response = await requestBridge(server.descriptor, { type: 'command', command: { id: 'old', type: 'message', ref: { ...agent.ref, generation: 'previous' }, text: 'must not deliver', delivery: 'followUp' } });
    expect(response.type).toBe('result');
    if (response.type === 'result') expect(response.result).toMatchObject({ ok: false, code: 'stale' });
    expect(changed).toBe(false);
  } finally { await server.close(); }
});
test('a child removed from the live registry cannot receive a queued message', async () => {
  let changed = false;
  const server = await createBridgeServer({ registryDir: registry(), instanceId: 'instance', generation: 'current', agents: () => [agent], dispatch: async command => { changed = true; return { id: command.id, ok: true, status: 'applied' }; } });
  try {
    const response = await requestBridge(server.descriptor, { type: 'command', command: { id: 'gone', type: 'models', ref: { ...agent.ref, agentId: 'finished-mouse' } } });
    if (response.type !== 'result') throw new Error('Expected an action result');
    expect(response.result).toMatchObject({ ok: false, code: 'stale' });
    expect(changed).toBe(false);
  } finally { await server.close(); }
});
