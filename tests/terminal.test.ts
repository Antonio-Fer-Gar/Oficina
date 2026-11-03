import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { focusTerminal, resolveTerminal } from '../src/terminal.ts';
const windowsTest = process.platform === 'win32' ? test : test.skip;
windowsTest('a reused PID with a different process creation time cannot be focused', async () => {
  const target = { pid: process.pid, startedAt: '2000-01-01T00:00:00.000Z', kind: 'windows-terminal' as const, marker: 'nter-0123abcd' };
  const result = await focusTerminal(target);
  expect(result).toMatchObject({ ok: false, code: 'stale' });
  expect(await resolveTerminal(target)).toBeNull();
}, 20000);
windowsTest('untrusted title metacharacters are literal data, never PowerShell instructions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nter-title-safety-'));
  const canary = join(directory, 'must-not-exist');
  try {
    const result = await focusTerminal({ pid: process.pid,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), kind: 'windows-terminal',
      marker: "'; New-Item -ItemType File -Path '" + canary.replaceAll("'", "''") + "'; '" + randomUUID() });
    expect(result).toMatchObject({ ok: false, code: 'unavailable' });
    expect(existsSync(canary)).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 20000);
windowsTest('a closed console reports closed instead of starting a replacement process', async () => {
  const result = await focusTerminal({ pid: 2147483647, startedAt: new Date().toISOString(), kind: 'classic', marker: randomUUID() });
  expect(result).toMatchObject({ ok: false, code: 'closed' });
}, 15000);
