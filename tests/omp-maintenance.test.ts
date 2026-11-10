import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installOmp, isOfficialOmp, runOmpMaintenance } from '../src/omp-maintenance.ts';

const binary = Buffer.from('verified executable');
const hash = createHash('sha256').update(binary).digest('hex');
function request(expected = hash): typeof fetch {
  return (async (input: RequestInfo | URL) => String(input).includes('/api/products/')
    ? Response.json({ build: { version: '1.2.3' }, file: { name: 'omp-windows-x64.exe', sha256: expected }, download: 'https://build.stencil.so/file' })
    : new Response(binary)) as typeof fetch;
}

test('does not download or overwrite an existing alternative command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-install-'));
  try {
    const bin = join(root, 'bin'); await mkdir(bin); await writeFile(join(bin, 'omp.cmd'), 'user');
    await installOmp(join(root, 'omp'), [bin], request());
    expect(await readFile(join(bin, 'omp.cmd'), 'utf8')).toBe('user');
    expect(await Bun.file(join(root, 'omp', 'omp.exe')).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installs only a checksum-verified binary and rejects corrupt downloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-install-'));
  try {
    const dir = join(root, 'omp');
    await expect(installOmp(dir, [], request('0'.repeat(64)))).rejects.toThrow();
    expect(await Bun.file(join(dir, 'omp.exe')).exists()).toBe(false);
    await installOmp(dir, [], request());
    expect(await readFile(join(dir, 'omp.exe'))).toEqual(binary);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a concurrent installation is not overwritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-install-'));
  try {
    const dir = join(root, 'omp');
    const racingRequest: typeof fetch = (async input => {
      if (String(input).includes('/api/products/')) return request()(input);
      await writeFile(join(dir, 'omp.exe'), 'other installer');
      return new Response(binary);
    }) as typeof fetch;
    await expect(installOmp(dir, [], racingRequest)).rejects.toThrow();
    expect(await readFile(join(dir, 'omp.exe'), 'utf8')).toBe('other installer');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an offline failure does not leave an executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-install-'));
  try {
    const dir = join(root, 'omp');
    await expect(installOmp(dir, [], (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).rejects.toThrow();
    expect(await Bun.file(join(dir, 'omp.exe')).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('maintenance waits for idle and honours the live preference', async () => {
  let updates = 0, active = true, enabled = true;
  const deps = { idle: async () => !active, update: async () => { updates++; }, log: async () => {} };
  await runOmpMaintenance(() => enabled, deps);
  active = false; enabled = false;
  await runOmpMaintenance(() => enabled, deps);
  expect(updates).toBe(0);
  enabled = true;
  await runOmpMaintenance(() => enabled, deps);
  expect(updates).toBe(1);
});

test('overlapping maintenance attempts do not start concurrent updates', async () => {
  let updates = 0;
  const { promise: blocked, resolve: release } = Promise.withResolvers<void>();
  const deps = { idle: async () => true, update: async () => { updates++; await blocked; }, log: async () => {} };
  const first = runOmpMaintenance(() => true, deps);
  await Promise.resolve(); await Promise.resolve();
  await runOmpMaintenance(() => true, deps);
  expect(updates).toBe(1);
  release(); await first;
});

test('recognizes only a stable official Windows build digest', async () => {
  const request = (async () => Response.json({
    builds: [{ product: 'omp', channel: 'stable', files: [{ name: 'omp-windows-x64.exe', sha256: hash }] }],
  })) as unknown as typeof fetch;
  expect(await isOfficialOmp(hash, request)).toBe(true);
  expect(await isOfficialOmp('0'.repeat(64), request)).toBe(false);
  const canary = (async () => Response.json({
    builds: [{ product: 'omp', channel: 'canary', files: [{ name: 'omp-windows-x64.exe', sha256: hash }] }],
  })) as unknown as typeof fetch;
  expect(await isOfficialOmp(hash, canary)).toBe(false);
});
