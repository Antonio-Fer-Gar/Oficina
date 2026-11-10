import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { installOmp } from './omp-maintenance.ts';

if (process.platform !== 'win32' || process.arch !== 'x64' || !process.env.LOCALAPPDATA) throw new Error('La instalación de omp requiere Windows x64.');
const dir = join(process.env.LOCALAPPDATA, 'omp');
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const readPath = "[Console]::Out.Write(([Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')))";
const registeredPath = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(readPath, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true });
const paths = ((process.env.PATH ?? '') + ';' + registeredPath).split(';').map(p => p.trim().replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole)).filter(Boolean);
const installed = await installOmp(dir, paths);
if (installed) {
  const script = String.raw`$ErrorActionPreference = 'Stop'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $path = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $dir = $env:NTER_OMP_INSTALL_DIR
  if (-not @($path.Split(';') | Where-Object { [Environment]::ExpandEnvironmentVariables($_.Trim('"').TrimEnd('\')) -ieq $dir }).Count) {
    $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
    if ($key.GetValueNames() -contains 'Path') { $kind = $key.GetValueKind('Path') }
    $separator = if ($path -and -not $path.EndsWith(';')) { ';' } else { '' }
    $key.SetValue('Path', $path + $separator + $dir, $kind)
  }
} finally { $key.Close() }`;
  execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: { ...process.env, NTER_OMP_INSTALL_DIR: dir }, windowsHide: true, stdio: 'inherit' });
}
