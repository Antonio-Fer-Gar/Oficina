import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// ASCII-only batch: installation paths stay in JSON, so spaces, %, ! and Unicode are data, not shell code.
const COMMAND = '@echo off\r\n@rem nter-office terminal launcher v1\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference=\'Stop\'; try { $file=Join-Path $env:LOCALAPPDATA \'nter-omp-office\\terminal-command.json\'; $entry=[IO.File]::ReadAllText($file) | ConvertFrom-Json; if (-not [IO.File]::Exists($entry.executable)) { throw \'missing executable\' }; $env:ELECTRON_RUN_AS_NODE=$null; Start-Process -FilePath $entry.executable } catch { [Console]::Error.WriteLine(\'No se pudo abrir Oficina nter. Vuelve a instalar la aplicacion.\'); exit 1 }"\r\nexit /b %errorlevel%\r\n';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
interface Registration { version: 1; executable: string; sha256: string }
function registration(file: string): Registration | null {
  if (!existsSync(file)) return null;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (value.version !== 1 || typeof value.executable !== 'string' || typeof value.sha256 !== 'string') throw new Error('El registro del comando oficina no es valido; no se modifica.');
  return value;
}
function save(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}
export function installTerminalCommand(executable: string, bin: string, stateFile: string): void {
  executable = resolve(executable);
  if (!statSync(executable).isFile()) throw new Error('No existe el ejecutable de Oficina nter.');
  const command = join(bin, 'oficina.cmd'), previous = registration(stateFile);
  if (existsSync(command) && (!previous || digest(readFileSync(command, 'utf8')) !== previous.sha256)) throw new Error('oficina.cmd ya existe o fue modificado; no se sobrescribe.');
  for (const extension of ['exe', 'com', 'bat', 'ps1']) {
    if (existsSync(join(bin, 'oficina.' + extension))) throw new Error('Ya existe otro comando oficina en la carpeta de comandos.');
  }
  save(command, COMMAND);
  save(stateFile, JSON.stringify({ version: 1, executable, sha256: digest(COMMAND) } satisfies Registration));
}
export function removeTerminalCommand(executable: string, bin: string, stateFile: string): void {
  const previous = registration(stateFile), command = join(bin, 'oficina.cmd');
  // An old uninstaller must not remove the command belonging to a newer installation elsewhere.
  if (!previous || previous.executable.toLowerCase() !== resolve(executable).toLowerCase()) return;
  if (existsSync(command)) {
    if (digest(readFileSync(command, 'utf8')) !== previous.sha256) throw new Error('oficina.cmd fue modificado; se conserva.');
    unlinkSync(command);
  }
  unlinkSync(stateFile);
  // .local/bin and its PATH entry are shared with other commands: never remove either.
}

if (import.meta.main) {
  if (process.platform !== 'win32') throw new Error('El comando instalado requiere Windows.');
  const [action, executable] = process.argv.slice(2);
  if (!executable || !['--install', '--remove'].includes(action!)) throw new Error('Uso: terminal-launcher.js --install|--remove <ejecutable>');
  const bin = join(homedir(), '.local', 'bin');
  const stateFile = join(process.env.LOCALAPPDATA!, 'nter-omp-office', 'terminal-command.json');
  if (action === '--remove') removeTerminalCommand(executable, bin, stateFile);
  else {
    installTerminalCommand(executable, bin, stateFile);
    const script = String.raw`
$ErrorActionPreference = 'Stop'
$bin = $env:NTER_OFFICE_COMMAND_BIN
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $path = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $present = @($path.Split(';') | Where-Object { [Environment]::ExpandEnvironmentVariables($_.Trim('"').TrimEnd('\')) -ieq $bin })
  if ($present.Count -eq 0) {
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    if ($key.GetValueNames() -contains 'Path') { $kind = $key.GetValueKind('Path') }
    $separator = if ($path -and -not $path.EndsWith(';')) { ';' } else { '' }
    $key.SetValue('Path', $path + $separator + $bin, $kind)
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public class OfficeEnvironment {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, UIntPtr w, string l, uint flags, uint timeout, out IntPtr result);
}
'@
    $result = [IntPtr]::Zero
    [void][OfficeEnvironment]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)
  }
} finally { $key.Close() }
exit 0
`;
    execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: { ...process.env, NTER_OFFICE_COMMAND_BIN: bin }, windowsHide: true, stdio: 'inherit' });
  }
  console.log(action === '--install' ? 'Comando oficina instalado.' : 'Comando oficina retirado.');
}
