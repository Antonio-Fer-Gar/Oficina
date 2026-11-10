import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { appendFile, link, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

// The upstream Windows installer uses this build service and its SHA-256 metadata:
// https://github.com/can1357/oh-my-pi/blob/main/scripts/install.ps1
export async function installOmp(dir: string, pathDirs: string[], request: typeof fetch = fetch): Promise<boolean> {
  const target = join(dir, 'omp.exe');
  if (existsSync(target) || pathDirs.some(path => ['exe', 'cmd', 'bat', 'com'].some(ext => existsSync(join(path, `omp.${ext}`))))) return false;
  const response = await request('https://build.stencil.so/api/products/omp/latest/windows-x86_64?channel=stable', { signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!response.ok) throw new Error('No se pudo consultar la versión oficial de omp.');
  const data = await response.json() as { file?: { sha256?: string; name?: string }; download?: string };
  if (data.file?.name !== 'omp-windows-x64.exe' || !/^[0-9a-f]{64}$/i.test(data.file?.sha256 ?? '') || typeof data.download !== 'string') throw new Error('La respuesta oficial de omp no es válida.');
  const url = new URL(data.download);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['build.stencil.so', 'd4c085d38fe197a3f20bbeb20222b8b3.r2.cloudflarestorage.com'].includes(url.hostname)) throw new Error('El origen de descarga de omp no es fiable.');
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.nter-omp-${randomUUID()}.tmp`);
  try {
    let download: Response;
    try { download = await request(url, { signal: AbortSignal.timeout(900000), redirect: 'error' }); }
    catch { throw new Error('No se pudo descargar omp; comprueba la conexión.'); }
    if (!download.ok || !download.body) throw new Error('No se pudo descargar omp.');
    const hash = createHash('sha256'); let size = 0;
    const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > 600 * 1024 * 1024) return callback(new Error('La descarga de omp es demasiado grande.'));
      hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(download.body as unknown as NodeReadableStream), verify, createWriteStream(temp, { flags: 'wx' }));
    const digest = hash.digest('hex');
    if (!size || digest !== data.file.sha256!.toLowerCase()) throw new Error('La descarga de omp no supera la comprobación de integridad.');
    // A hard link creates the destination only if still absent, even across concurrent installers.
    await link(temp, target);
    return true;
  } finally { await unlink(temp).catch(() => {}); }
}

interface MaintenanceDeps {
  idle(): Promise<boolean>;
  update(): Promise<void>;
  log(): Promise<void>;
}
let maintenanceRunning = false, maintenanceStarted = false;

export async function runOmpMaintenance(enabled: () => boolean, deps: MaintenanceDeps): Promise<void> {
  if (maintenanceRunning || !enabled()) return;
  maintenanceRunning = true;
  try {
    if (await deps.idle() && enabled()) await deps.update();
  } catch {
    await deps.log().catch(() => {});
  } finally { maintenanceRunning = false; }
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

// Match the installed bytes against stable builds from omp's official build service.
export async function isOfficialOmp(hash: string, request: typeof fetch = fetch): Promise<boolean> {
  const response = await request('https://build.stencil.so/api/products/omp/builds', {
    redirect: 'error', signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error('No se pudo verificar el origen de omp.');
  const catalog: unknown = await response.json();
  if (!catalog || typeof catalog !== 'object' || !('builds' in catalog) || !Array.isArray(catalog.builds)) {
    throw new Error('La lista oficial de versiones no es válida.');
  }
  return catalog.builds.some(build => build && build.product === 'omp' && build.channel === 'stable' &&
    Array.isArray(build.files) && build.files.some((file: { name?: unknown; sha256?: unknown }) =>
      file?.name === 'omp-windows-x64.exe' && file.sha256 === hash));
}

export function startOmpMaintenance(dataDir: string, enabled: () => boolean): void {
  if (maintenanceStarted || process.platform !== 'win32' || !process.env.LOCALAPPDATA) return;
  maintenanceStarted = true;
  const dir = join(process.env.LOCALAPPDATA, 'omp'), executable = join(dir, 'omp.exe');
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const exec = promisify(execFile);
  const deps: MaintenanceDeps = {
    async idle() {
      const script = "$ErrorActionPreference='Stop'; [Console]::Out.Write(@(Get-CimInstance Win32_Process -Filter \"Name='omp.exe'\").Count)";
      const result = await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
      if (!/^\d+$/.test(result.stdout.trim())) throw new Error('Inventario incompleto');
      return Number(result.stdout.trim()) === 0 && await isOfficialOmp(await fileHash(executable));
    },
    async update() {
      // Another terminal can start after the process inventory; upstream renames
      // the old image instead of stopping it, but a launch can briefly fail.
      const env: NodeJS.ProcessEnv = { ...process.env, PATH: dir + ';' + (process.env.PATH ?? '') };
      delete env.PI_BUILD_URL;
      const done = Promise.withResolvers<void>();
      const child = spawn(executable, ['update'], { env, windowsHide: true, stdio: 'ignore' });
      child.once('error', done.reject);
      child.once('exit', code => code === 0 ? done.resolve() : done.reject(new Error('Falló la actualización')));
      await done.promise;
    },
    async log() {
      await mkdir(dataDir, { recursive: true });
      await appendFile(join(dataDir, 'omp-maintenance.log'), `${new Date().toISOString()} No se pudo completar el mantenimiento de omp; se volverá a intentar.\n`);
    },
  };
  const tick = () => { void runOmpMaintenance(enabled, deps); };
  tick();
  setInterval(tick, 6 * 60 * 60 * 1000).unref();
}

