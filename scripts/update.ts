import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dir, '..');
async function run(command: string, args: string[], capture = false, extraEnv: Record<string, string> = {}): Promise<string> {
  const result = Promise.withResolvers<string>();
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...extraEnv }, windowsHide: true,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let output = '', errors = '';
  child.stdout?.on('data', bytes => { output += bytes; });
  child.stderr?.on('data', bytes => { errors += bytes; });
  child.on('error', result.reject);
  child.on('exit', code => code === 0 ? result.resolve(output.trim()) : result.reject(new Error(`${command}: salida ${code}\n${errors}`)));
  return result.promise;
}
const powershell = (script: string, env: Record<string, string> = {}) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], true, env);
if (process.platform !== 'win32') throw new Error('La actualización instalada requiere Windows.');
const installed = await powershell(String.raw`
$ErrorActionPreference = 'Stop'
$entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName -eq 'Oficina nter' } | Select-Object -First 1
if ($entry.InstallLocation) { $entry.InstallLocation }
else { Join-Path $env:LOCALAPPDATA 'Programs\Oficina nter' }
`);
const executable = join(installed, 'Oficina nter.exe');
if (!existsSync(executable) || !existsSync(join(installed, 'resources', 'app.asar'))) throw new Error('No se encontró una instalación de Oficina nter: ' + installed);
console.log('Destino instalado: ' + executable);
if (process.argv.includes('--dry-run')) process.exit(0);

// Nothing installed is touched until every gate and the complete installer have succeeded.
await run(process.execPath, ['test']);
await run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
await run(process.execPath, ['scripts/build.ts']);
await run(process.execPath, ['node_modules/electron-builder/cli.js', '--win', 'nsis', '--x64', '--publish', 'never', '--config.directories.output=release/update']);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const installer = join(root, 'release', 'update', `Oficina nter Setup ${pkg.version}.exe`);
const staged = join(root, 'release', 'update', 'win-unpacked', 'resources', 'app.asar');
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const expected = hash(staged);
// Match executable paths, not process names or an untrusted/stale launcher PID.
await powershell(`
$ErrorActionPreference = 'Stop'
$items = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -eq $env:NTER_UPDATE_EXE -or
  ($_.ExecutablePath -eq $env:NTER_UPDATE_DEV -and $_.CommandLine -like ('*"' + $env:NTER_UPDATE_ROOT + '"*') -and $_.CommandLine -notlike '*--type=*')
}
foreach ($item in $items) {
  $p = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne 0) {
    if (-not $p.CloseMainWindow()) { throw 'No se pudo cerrar la oficina.' }
    if (-not $p.WaitForExit(15000)) { throw 'La oficina no se ha cerrado; no se instala.' }
  }
}
exit 0
`, { NTER_UPDATE_EXE: executable, NTER_UPDATE_DEV: join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), NTER_UPDATE_ROOT: root });
await run(installer, ['/S', '/D=' + installed]);
if (hash(join(installed, 'resources', 'app.asar')) !== expected) throw new Error('El archivo instalado no coincide con la compilación verificada.');
const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false });
const started = Promise.withResolvers<void>();
child.once('spawn', () => started.resolve()); child.once('error', started.reject);
await started.promise;
child.unref();
const launcher = join(process.env.LOCALAPPDATA!, 'nter-omp-office', 'launcher.json');
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const current = JSON.parse(readFileSync(launcher, 'utf8'));
    if (current.command?.toLowerCase() === executable.toLowerCase() && current.pid) {
      process.kill(current.pid, 0); ready = true; break;
    }
  } catch { /* Wait for the restarted office to publish its launcher. */ }
  await Bun.sleep(500);
}
if (!ready) throw new Error('Instalación actualizada, pero no se confirmó la reapertura de la oficina.');
console.log('Oficina instalada actualizada y reabierta. SHA256 app.asar: ' + expected);
