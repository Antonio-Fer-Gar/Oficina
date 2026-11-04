import { afterAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';

const dataDir = mkdtempSync(join(tmpdir(), 'nter-token-saving-'));
const preferences = join(dataDir, 'preferences.json');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));
const previousDataDir = process.env.NTER_OFFICE_DATA;
process.env.NTER_OFFICE_DATA = dataDir;
// Set NTER_OFFICE_DATA before module evaluation; the extension captures its shared dataDir once.
const { default: officeExtension } = await import('../src/bridge/extension.ts');
if (previousDataDir === undefined) delete process.env.NTER_OFFICE_DATA;
else process.env.NTER_OFFICE_DATA = previousDataDir;
const hooks = new Map<string, unknown>();
officeExtension({ on: (event: string, handler: unknown) => hooks.set(event, handler) } as unknown as ExtensionAPI);
const beforeAgentStart = hooks.get('before_agent_start') as (event: BeforeAgentStartEvent, ctx: ExtensionContext) => BeforeAgentStartEventResult | undefined;
const original = ['base system instructions', 'an earlier extension instruction'];
async function preparePrompt(systemPrompt = original, reason: BeforeAgentStartEvent['reason'] = 'prompt') {
  return await beforeAgentStart({ type: 'before_agent_start', reason, prompt: 'task', systemPrompt }, {} as ExtensionContext);
}

test('enabled token saving appends bundled policy without changing earlier prompt blocks', async () => {
  writeFileSync(preferences, JSON.stringify({ tokenSaving: true }));
  const result = await preparePrompt();
  expect(result?.systemPrompt?.slice(0, original.length)).toEqual(original);
  expect(original).toEqual(['base system instructions', 'an earlier extension instruction']);
  expect(result?.systemPrompt).toHaveLength(original.length + 1);
  expect(await preparePrompt(result!.systemPrompt!)).toBeUndefined();
  expect((await preparePrompt(original, 'revive'))?.systemPrompt).toEqual(result?.systemPrompt);
});

test('explicitly disabled token saving leaves the system prompt alone', async () => {
  writeFileSync(preferences, JSON.stringify({ tokenSaving: false }));
  writeFileSync(preferences, JSON.stringify({ tokenSaving: true }));
  const enabled = await preparePrompt();
  writeFileSync(preferences, JSON.stringify({ tokenSaving: false }));
  expect((await preparePrompt(enabled!.systemPrompt!))?.systemPrompt).toEqual(original);
  expect(await preparePrompt()).toBeUndefined();
  expect(original).toEqual(['base system instructions', 'an earlier extension instruction']);
});

test('missing and legacy preferences default token saving on', async () => {
  rmSync(preferences, { force: true });
  expect((await preparePrompt())?.systemPrompt?.slice(0, original.length)).toEqual(original);
  writeFileSync(preferences, JSON.stringify({ muted: true }));
  expect((await preparePrompt())?.systemPrompt?.slice(0, original.length)).toEqual(original);
});

test('malformed or unreadable preferences do not prevent prompt preparation', async () => {
  writeFileSync(preferences, '{invalid json');
  expect((await preparePrompt())?.systemPrompt?.slice(0, original.length)).toEqual(original);
  rmSync(preferences, { force: true });
  mkdirSync(preferences);
  expect((await preparePrompt())?.systemPrompt?.slice(0, original.length)).toEqual(original);
});
