import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { TerminalTarget } from './bridge/protocol.ts';

export type FocusResult = { ok: true } | { ok: false; code: 'closed' | 'stale' | 'unavailable'; message: string };
const Marker = /^nter-[0-9a-f]{8}$/;
const HelperResult = z.object({
  state: z.enum(['focused', 'resolved', 'closed', 'stale', 'unavailable', 'denied']),
  handle: z.string().optional(), count: z.number().optional(),
});
// Constant script: every value from omp or a title arrives through environment variables, never source text.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
function Out($value) { $value | ConvertTo-Json -Compress; exit 0 }
$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$env:NTER_PID)
if (-not $process) { Out @{ state = 'closed' } }
$expected = [DateTimeOffset]::Parse($env:NTER_STARTED).UtcDateTime
if ([Math]::Abs(($process.CreationDate.ToUniversalTime() - $expected).TotalSeconds) -gt 5) { Out @{ state = 'stale' } }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Namespace Nter -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool FlashWindow(IntPtr hWnd, bool invert);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@
$automation = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$marker = $env:NTER_MARKER
$found = New-Object System.Collections.ArrayList
# WT_SESSION can be inherited by a classic console started from Windows Terminal, so search both kinds.
foreach ($window in $automation::RootElement.FindAll($scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
  if ($window.Current.ClassName -eq 'CASCADIA_HOSTING_WINDOW_CLASS') {
    $tabCondition = New-Object System.Windows.Automation.PropertyCondition ($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
    foreach ($tab in $window.FindAll($scope::Descendants, $tabCondition)) {
      if ($tab.Current.Name.Contains($marker)) { [void]$found.Add(@($window, $tab)) }
    }
  } elseif ($window.Current.Name.Contains($marker)) { [void]$found.Add(@($window, $null)) }
}
if ($found.Count -ne 1) { Out @{ state = 'unavailable'; count = $found.Count } }
$window = $found[0][0]; $tab = $found[0][1]
$handle = [IntPtr]$window.Current.NativeWindowHandle
if ($env:NTER_ACTION -eq 'resolve') { Out @{ state = 'resolved'; handle = [string]$window.Current.NativeWindowHandle } }
if ($tab) { $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() }
if ([Nter.Win]::IsIconic($handle)) { [void][Nter.Win]::ShowWindow($handle, 9) }
[void][Nter.Win]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 150
if ([Nter.Win]::GetForegroundWindow() -eq $handle) { Out @{ state = 'focused'; handle = [string]$window.Current.NativeWindowHandle } }
[void][Nter.Win]::FlashWindow($handle, $true)
Out @{ state = 'denied'; handle = [string]$window.Current.NativeWindowHandle }
`;

function runHelper(target: TerminalTarget, action: 'resolve' | 'focus'): Promise<z.infer<typeof HelperResult>> {
  const done = Promise.withResolvers<z.infer<typeof HelperResult>>();
  execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    windowsHide: true, timeout: 10000, maxBuffer: 65536,
    env: { ...process.env, NTER_PID: String(target.pid), NTER_STARTED: target.startedAt, NTER_MARKER: target.marker, NTER_ACTION: action },
  }, (error, stdout) => {
    if (error) { done.reject(error); return; }
    try { done.resolve(HelperResult.parse(JSON.parse(stdout.trim()))); } catch (parseError) { done.reject(parseError); }
  });
  return done.promise;
}
function preflight(target: TerminalTarget): FocusResult | null {
  if (process.platform !== 'win32') return { ok: false, code: 'unavailable', message: 'Activar la consola requiere Windows' };
  if (!Marker.test(target.marker) || Number.isNaN(Date.parse(target.startedAt))) return { ok: false, code: 'unavailable', message: 'La identidad de la consola no es fiable' };
  return null;
}
export async function resolveTerminal(target: TerminalTarget): Promise<TerminalTarget | null> {
  if (preflight(target)) return null;
  const result = await runHelper(target, 'resolve');
  return result.state === 'resolved' && result.handle ? { ...target, windowHandle: result.handle } : null;
}
export async function focusTerminal(target: TerminalTarget): Promise<FocusResult> {
  const rejected = preflight(target);
  if (rejected) {
    // A dead PID still means closed even when its identity cannot be used for activation.
    if (process.platform === 'win32' && !Number.isNaN(Date.parse(target.startedAt))) {
      try { process.kill(target.pid, 0); } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return { ok: false, code: 'closed', message: 'La consola original se ha cerrado' };
      }
    }
    return rejected;
  }
  const result = await runHelper(target, 'focus');
  if (result.state === 'focused') return { ok: true };
  if (result.state === 'closed') return { ok: false, code: 'closed', message: 'La consola original se ha cerrado' };
  if (result.state === 'stale') return { ok: false, code: 'stale', message: 'Ese proceso ya no es la consola original' };
  if (result.state === 'denied') return { ok: false, code: 'unavailable', message: 'Windows no permitió traer la consola al frente; búscala parpadeando en la barra de tareas' };
  return { ok: false, code: 'unavailable', message: result.count ? 'Hay más de una consola con esta identidad' : 'No se encontró la pestaña de la consola original' };
}
