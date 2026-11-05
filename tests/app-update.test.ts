import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { expect, test } from 'bun:test';
import { checkAppUpdate, downloadInstaller, parseUpdateRelease, verifyInstallerDigest } from '../src/app-update.ts';
import { waitForInstallSignal } from '../src/app-update-helper.ts';

const installer = Buffer.from('exe');
const digest = createHash('sha256').update(installer).digest('hex');
const releaseTag = 'v0.1.7';
const assetName = 'Oficina.nter.Setup.0.1.7.exe';
const assetUrl = `https://github.com/Antonio-Fer-Gar/Oficina/releases/download/${releaseTag}/${assetName}`;

function metadata() {
  return {
    tag_name: releaseTag,
    name: 'Oficina nter 0.1.7',
    draft: false,
    prerelease: false,
    body: 'Instalador para Windows de 64 bits.',
    published_at: '2026-01-01T00:00:00Z',
    html_url: `https://github.com/Antonio-Fer-Gar/Oficina/releases/tag/${releaseTag}`,
    assets: [{
      name: assetName,
      state: 'uploaded',
      size: installer.length,
      digest: `sha256:${digest}`,
      browser_download_url: assetUrl,
    }],
  };
}

function replaceAsset(patch: Record<string, unknown>) {
  const value = metadata();
  value.assets[0] = { ...value.assets[0], ...patch } as typeof value.assets[0];
  return value;
}

async function temporaryDirectory() {
  return mkdtemp(join(tmpdir(), 'nter-app-update-test-'));
}

test('reports only a newer stable release published on GitHub', async () => {
  const requested: string[] = [];
  const result = await checkAppUpdate('0.1.6', async url => {
    requested.push(url);
    return new Response(JSON.stringify(metadata()));
  });
  expect(requested).toEqual(['https://api.github.com/repos/Antonio-Fer-Gar/Oficina/releases/latest']);
  expect(result).toEqual({ version: '0.1.7', currentVersion: '0.1.6', notes: 'Instalador para Windows de 64 bits.' });
  expect(await checkAppUpdate('0.1.7', async () => new Response(JSON.stringify(metadata())))).toBeNull();
  expect(await checkAppUpdate('1.0.0', async () => new Response(JSON.stringify(metadata())))).toBeNull();
  expect(await checkAppUpdate('01.0.0', async () => new Response(JSON.stringify(metadata())))).toBeNull();
  expect(await checkAppUpdate('1.0.0-beta', async () => new Response(JSON.stringify(metadata())))).toBeNull();
  const numeric = metadata();
  numeric.tag_name = 'v0.10.0';
  numeric.name = 'Oficina nter 0.10.0';
  numeric.html_url = 'https://github.com/Antonio-Fer-Gar/Oficina/releases/tag/v0.10.0';
  numeric.assets[0] = {
    ...numeric.assets[0],
    name: 'Oficina.nter.Setup.0.10.0.exe',
    browser_download_url: 'https://github.com/Antonio-Fer-Gar/Oficina/releases/download/v0.10.0/Oficina.nter.Setup.0.10.0.exe',
  };
  expect(await checkAppUpdate('0.9.9', async () => new Response(JSON.stringify(numeric)))).toEqual({
    version: '0.10.0', currentVersion: '0.9.9', notes: 'Instalador para Windows de 64 bits.',
  });
});

test('shows release changes without installer details and handles missing notes', async () => {
  const withNotes = { ...metadata(), body: 'Instalador para Windows.\n\n- Cambio **importante**.\n- Segunda mejora.\n\nSHA256: abc' };
  expect((await checkAppUpdate('0.1.6', async () => new Response(JSON.stringify(withNotes))))?.notes)
    .toBe('- Cambio **importante**.\n- Segunda mejora.');
  const withoutNotes = { ...metadata(), body: null };
  expect((await checkAppUpdate('0.1.6', async () => new Response(JSON.stringify(withoutNotes))))?.notes)
    .toBe('Esta versión no incluye notas de cambios.');
});

test('rejects malformed, draft, prerelease, or unpublished release metadata', () => {
  const invalid = [
    { ...metadata(), tag_name: 'v01.0.7' },
    { ...metadata(), tag_name: 'v0.1' },
    { ...metadata(), tag_name: 'v0.1.7-beta' },
    { ...metadata(), draft: true },
    { ...metadata(), prerelease: true },
    { ...metadata(), published_at: null },
    replaceAsset({ name: 'Oficina.nter.Setup.0.1.7-arm64.exe' }),
    replaceAsset({ size: 0 }),
    replaceAsset({ size: 1.5 }),
    replaceAsset({ size: 1_000_000_001 }),
    replaceAsset({ digest: 'sha256:xyz' }),
    replaceAsset({ digest: null }),
    replaceAsset({ state: 'new' }),
  ];
  for (const value of invalid) expect(parseUpdateRelease(value)).toBeNull();
});

test('accepts a published release regardless of its title or release notes', () => {
  expect(parseUpdateRelease({ ...metadata(), name: 'Novedades', body: null })?.version).toBe('0.1.7');
});

test('rejects release URLs outside the exact GitHub repository and release path', () => {
  const invalid = [
    { ...metadata(), html_url: 'https://github.com/Antonio-Fer-Gar/Other/releases/tag/v0.1.7' },
    replaceAsset({ browser_download_url: 'http://github.com/Antonio-Fer-Gar/Oficina/releases/download/v0.1.7/' + assetName }),
    replaceAsset({ browser_download_url: 'https://github.com.evil.example/Antonio-Fer-Gar/Oficina/releases/download/v0.1.7/' + assetName }),
    replaceAsset({ browser_download_url: 'https://github.com/Other/Oficina/releases/download/v0.1.7/' + assetName }),
    replaceAsset({ browser_download_url: 'https://github.com/Antonio-Fer-Gar/Oficina/releases/download/v0.1.8/' + assetName }),
  ];
  for (const value of invalid) expect(parseUpdateRelease(value)).toBeNull();
});

test('downloads the official installer to disk and accepts it only after size and digest verification', async () => {
  const release = parseUpdateRelease(metadata())!;
  const stagingRoot = await temporaryDirectory();
  try {
    const downloaded = await downloadInstaller(release, async url => {
      expect(url).toBe(assetUrl);
      return new Response(installer, { headers: { 'content-length': String(installer.length) } });
    }, stagingRoot);
    expect(await readFile(downloaded.installer)).toEqual(installer);
    expect(downloaded.digest).toBe(digest);
    expect(await readdir(stagingRoot)).toHaveLength(1);
    await rm(downloaded.directory, { recursive: true, force: true });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test('rejects an untrusted asset redirect and leaves no partial installer', async () => {
  const release = parseUpdateRelease(metadata())!;
  const stagingRoot = await temporaryDirectory();
  try {
    await expect(downloadInstaller(release, async () => new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.example/installer.exe' },
    }), stagingRoot)).rejects.toThrow();
    expect(await readdir(stagingRoot)).toEqual([]);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test('follows a verified GitHub release-asset CDN redirect', async () => {
  const release = parseUpdateRelease(metadata())!;
  const stagingRoot = await temporaryDirectory();
  const cdnUrl = 'https://release-assets.githubusercontent.com/download/file?token=signed';
  const requested: string[] = [];
  try {
    const downloaded = await downloadInstaller(release, async url => {
      requested.push(url);
      if (url === assetUrl) return new Response(null, { status: 302, headers: { location: cdnUrl } });
      return new Response(installer);
    }, stagingRoot);
    expect(requested).toEqual([assetUrl, cdnUrl]);
    await rm(downloaded.directory, { recursive: true, force: true });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});
test('rejects a same-sized installer with a different SHA-256 digest and removes it', async () => {
  const release = parseUpdateRelease(metadata())!;
  const stagingRoot = await temporaryDirectory();
  try {
    await expect(downloadInstaller(release, async () => new Response(Buffer.from('bad')), stagingRoot)).rejects.toThrow(/SHA-256/);
    expect(await readdir(stagingRoot)).toEqual([]);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});
test('rechecks the staged installer digest immediately before execution', async () => {
  const directory = await temporaryDirectory();
  const file = join(directory, assetName);
  try {
    await writeFile(file, installer);
    await expect(verifyInstallerDigest(file, digest)).resolves.toBeUndefined();
    await writeFile(file, Buffer.from('bad'));
    await expect(verifyInstallerDigest(file, digest)).rejects.toThrow(/SHA-256/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an installer whose downloaded length differs from release metadata', async () => {
  const release = parseUpdateRelease(metadata())!;
  const stagingRoot = await temporaryDirectory();
  try {
    await expect(downloadInstaller(release, async () => new Response(Buffer.from('too long')), stagingRoot)).rejects.toThrow(/tamaño/);
    expect(await readdir(stagingRoot)).toEqual([]);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test('treats release API failures as no available update', async () => {
  expect(await checkAppUpdate('0.1.6', async () => new Response('offline', { status: 503 }))).toBeNull();
  expect(await checkAppUpdate('0.1.6', async () => { throw new Error('offline'); })).toBeNull();
});

test('accepts the install signal before the pipe closes', async () => {
  const stream = new PassThrough();
  const ready = waitForInstallSignal(stream);
  stream.end('INSTALL\n');
  await expect(ready).resolves.toBeUndefined();
});
