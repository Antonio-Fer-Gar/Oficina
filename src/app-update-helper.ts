import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyInstallerDigest } from './app-update.ts';
const [installer, expectedDigest, installDirectory, executable, dataDirectory, parentPidText] = process.argv.slice(2);
const parentPid = Number(parentPidText);
const errorFile = join(dataDirectory ?? process.cwd(), 'app-update-error.json');

function saveJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, file);
}

function publishLauncher(pid: number, installing = false): void {
  saveJson(join(dataDirectory!, 'launcher.json'), { command: executable, args: [], pid, ...(installing ? { installing: true } : {}) });
}

export function waitForInstallSignal(stream: NodeJS.ReadableStream = process.stdin): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = createInterface({ input: stream });
    input.once('line', line => {
      if (line === 'INSTALL') resolve();
      else reject(new Error('No se recibió la autorización para iniciar la instalación.'));
      input.close();
    });
    input.once('close', () => reject(new Error('Se perdió la conexión con la oficina antes de instalar.')));
  });
}

function waitForParentExit(): void {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$targetId = [int]$env:NTER_UPDATE_PARENT_PID
$targetExe = $env:NTER_UPDATE_PARENT_EXE
while ($true) {
  $entry = Get-CimInstance Win32_Process -Filter "ProcessId = $targetId" -ErrorAction SilentlyContinue
  if (-not $entry) { exit 0 }
  if (-not $entry.ExecutablePath) { Start-Sleep -Milliseconds 200; continue }
  if ($entry.ExecutablePath -ine $targetExe) { exit 0 }
  Start-Sleep -Milliseconds 200
}
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: { ...process.env, NTER_UPDATE_PARENT_PID: String(parentPid), NTER_UPDATE_PARENT_EXE: executable! },
    windowsHide: true,
    stdio: 'ignore',
  });
  if (result.error || result.status !== 0) throw new Error('No se pudo confirmar el cierre de la oficina; no se ejecutó el instalador.');
}

function runInstaller(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(installer!, ['/S', `/D=${installDirectory}`], { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      if (child.pid) {
        try { publishLauncher(child.pid, true); } catch { /* The helper PID still reserves launcher.json. */ }
      }
    });
    child.once('exit', code => resolve(code ?? 1));
  });
}

function launchOffice(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable!, [], { detached: true, windowsHide: false, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

async function waitForOffice(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const launcher = JSON.parse(readFileSync(join(dataDirectory!, 'launcher.json'), 'utf8')) as { command?: string; pid?: number };
      if (launcher.command?.toLowerCase() === executable!.toLowerCase() && launcher.pid && launcher.pid !== process.pid) {
        try { process.kill(launcher.pid, 0); return; } catch { /* Wait for the application to publish a live PID. */ }
      }
    } catch { /* The office writes launcher.json during startup. */ }
    await delay(250);
  }
  throw new Error('La instalación terminó, pero no se confirmó la reapertura de la oficina.');
}

function showWindowsError(message: string): void {
  const script = String.raw`Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:NTER_UPDATE_ERROR, 'Oficina nter', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: { ...process.env, NTER_UPDATE_ERROR: message }, windowsHide: false, stdio: 'ignore',
  });
  child.on('error', () => undefined);
  child.unref();
}
function scheduleCleanup(directory: string): void {
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Wait-Process -Id ([int]$env:NTER_UPDATE_HELPER_PID) -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $env:NTER_UPDATE_STAGING -Recurse -Force -ErrorAction SilentlyContinue
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      env: { ...process.env, NTER_UPDATE_HELPER_PID: String(process.pid), NTER_UPDATE_STAGING: directory },
      detached: true, windowsHide: true, stdio: 'ignore',
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {}
}

async function main(): Promise<void> {
  if (process.platform !== 'win32' || process.arch !== 'x64' || !installer || !/^[a-f\d]{64}$/i.test(expectedDigest ?? '')
    || !installDirectory || !executable || !dataDirectory || !Number.isSafeInteger(parentPid) || parentPid < 1
    || !existsSync(installer) || !existsSync(executable) || dirname(executable).toLowerCase() !== installDirectory.toLowerCase()) {
    throw new Error('El proceso de instalación recibió rutas o plataforma no válidas.');
  }

  publishLauncher(process.pid, true);
  process.stdout.write('READY\n');
  await waitForInstallSignal();
  waitForParentExit();
  await verifyInstallerDigest(installer, expectedDigest!);

  const exitCode = await runInstaller();
  publishLauncher(process.pid);
  if (exitCode !== 0) throw new Error(`El instalador terminó con código ${exitCode}.`);
  await launchOffice();
  await waitForOffice();
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar la instalación de la actualización.';
    try { saveJson(errorFile, { message }); } catch { /* The fallback dialog still reports the failure. */ }
    try { publishLauncher(process.pid); } catch {}
    try {
      if (existsSync(executable!)) {
        await launchOffice();
        await waitForOffice();
      } else showWindowsError(message);
    } catch {
      showWindowsError(message);
    }
    process.exitCode = 1;
  } finally {
    if (installer) {
      try { rmSync(installer, { force: true }); } catch {}
      scheduleCleanup(dirname(installer));
    }
  }
}
