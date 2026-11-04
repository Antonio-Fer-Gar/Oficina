import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPOSITORY = 'Antonio-Fer-Gar/Oficina';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const CHECK_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const MAX_ASSET_SIZE = 1_000_000_000;
const MAX_REDIRECTS = 5;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DIGEST = /^sha256:([a-f\d]{64})$/i;
const REDIRECT_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

type Requester = (url: string, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;
export interface UpdateRelease {
  version: string;
  assetName: string;
  assetUrl: string;
  size: number;
  digest: string;
}
export interface DownloadedUpdate {
  directory: string;
  installer: string;
  version: string;
  digest: string;
}

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareVersions(left: string, right: string): number {
  const a = VERSION.exec(left);
  const b = VERSION.exec(right);
  if (!a || !b) return 0;
  for (let index = 1; index <= 3; index++) {
    const next = a[index]!;
    const current = b[index]!;
    if (next.length !== current.length) return next.length > current.length ? 1 : -1;
    if (next !== current) return next > current ? 1 : -1;
  }
  return 0;
}

export function parseUpdateRelease(value: unknown): UpdateRelease | null {
  if (!object(value)) return null;
  const versionMatch = typeof value.tag_name === 'string' ? /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value.tag_name) : null;
  if (!versionMatch) return null;
  const version = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;
  const tag = `v${version}`;
  if (value.draft !== false || value.prerelease !== false
    || typeof value.published_at !== 'string' || !Number.isFinite(Date.parse(value.published_at))
    || value.html_url !== `https://github.com/${REPOSITORY}/releases/tag/${tag}` || !Array.isArray(value.assets)) return null;

  const expectedName = `Oficina.nter.Setup.${version}.exe`;
  const assets = value.assets.filter(asset => object(asset) && asset.name === expectedName);
  if (assets.length !== 1) return null;
  const asset = assets[0] as JsonObject;
  const digest = typeof asset.digest === 'string' ? DIGEST.exec(asset.digest) : null;
  const expectedUrl = `https://github.com/${REPOSITORY}/releases/download/${tag}/${expectedName}`;
  if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || (asset.size as number) < 1
    || (asset.size as number) > MAX_ASSET_SIZE || !digest || asset.browser_download_url !== expectedUrl) return null;
  return { version, assetName: expectedName, assetUrl: expectedUrl, size: asset.size as number, digest: digest[1]!.toLowerCase() };
}

export async function latestAppUpdate(currentVersion: string, request: Requester = fetch): Promise<UpdateRelease | null> {
  if (!VERSION.test(currentVersion)) throw new Error('La versión instalada no es semántica estable.');
  const response = await request(RELEASES_API, {
    headers: { accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('No se pudo consultar la última release estable de GitHub.');
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('GitHub devolvió metadatos de release inválidos.'); }
  const release = parseUpdateRelease(data);
  if (!release) throw new Error('La última release de GitHub no contiene un instalador estable válido para Windows x64.');
  return compareVersions(release.version, currentVersion) > 0 ? release : null;
}

export async function checkAppUpdate(currentVersion: string, request: Requester = fetch): Promise<{ version: string; currentVersion: string } | null> {
  try {
    const release = await latestAppUpdate(currentVersion, request);
    return release ? { version: release.version, currentVersion } : null;
  } catch {
    return null;
  }
}

function validateReleaseForDownload(release: UpdateRelease): void {
  if (!VERSION.test(release.version) || release.assetName !== `Oficina.nter.Setup.${release.version}.exe`
    || release.assetUrl !== `https://github.com/${REPOSITORY}/releases/download/v${release.version}/${release.assetName}`
    || !Number.isSafeInteger(release.size) || release.size < 1 || release.size > MAX_ASSET_SIZE
    || !/^[a-f\d]{64}$/i.test(release.digest)) throw new Error('Los metadatos del instalador ya no son válidos.');
}

function trustedRedirect(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && REDIRECT_HOSTS.has(url.hostname);
}

async function requestInstaller(url: string, request: Requester): Promise<Response> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await request(current.href, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === MAX_REDIRECTS) throw new Error('GitHub devolvió una redirección de descarga inválida.');
      const next = new URL(location, current);
      if (!trustedRedirect(next)) throw new Error('La descarga redirigió fuera del CDN seguro de GitHub.');
      current = next;
      continue;
    }
    if (response.status !== 200 || (current.hostname !== 'github.com' && !trustedRedirect(current))) {
      await response.body?.cancel();
      throw new Error('No se pudo descargar el instalador desde GitHub.');
    }
    return response;
  }
  throw new Error('GitHub devolvió demasiadas redirecciones de descarga.');
}

export async function downloadInstaller(release: UpdateRelease, request: Requester = fetch, stagingRoot = tmpdir()): Promise<DownloadedUpdate> {
  validateReleaseForDownload(release);
  const directory = await mkdtemp(join(stagingRoot, 'nter-omp-update-'));
  const installer = join(directory, release.assetName);
  try {
    const response = await requestInstaller(release.assetUrl, request);
    if (!response.body) throw new Error('GitHub devolvió un instalador vacío.');
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== release.size)) {
      await response.body.cancel();
      throw new Error('El tamaño del instalador no coincide con los metadatos de GitHub.');
    }

    const hash = createHash('sha256');
    let size = 0;
    const verifier = new Transform({
      transform(chunk: Uint8Array, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > release.size) return callback(new Error('El tamaño del instalador no coincide con los metadatos de GitHub.'));
        hash.update(bytes);
        callback(null, bytes);
      },
    });
    await pipeline(Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]), verifier, createWriteStream(installer, { flags: 'wx' }));
    if (size !== release.size) throw new Error('El tamaño del instalador no coincide con los metadatos de GitHub.');
    const digest = hash.digest('hex');
    if (digest !== release.digest) throw new Error('El digest SHA-256 del instalador no coincide con GitHub.');
    return { directory, installer, version: release.version, digest };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
export async function verifyInstallerDigest(installer: string, expectedDigest: string): Promise<void> {
  if (!/^[a-f\d]{64}$/i.test(expectedDigest)) throw new Error('Los metadatos del digest SHA-256 no son válidos.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  if (hash.digest('hex') !== expectedDigest.toLowerCase()) throw new Error('El digest SHA-256 del instalador cambió antes de ejecutarlo.');
}
