import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentInfo } from './protocol.ts';

// Lists interactive omp.exe processes and reads their working folder and WT_SESSION from the
// process parameters (same user, read-only). Constant script: no value is interpolated.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class NterPeb {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, long[] info, int size, out int len);
  static byte[] Read(IntPtr h, long addr, int size) { var b = new byte[size]; IntPtr r; if (!ReadProcessMemory(h, (IntPtr)addr, b, (IntPtr)size, out r)) return null; return b; }
  public static string[] Inspect(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var info = new long[6]; int len;
      if (NtQueryInformationProcess(h, 0, info, 48, out len) != 0) return null;
      var peb = Read(h, info[1] + 0x20, 8); if (peb == null) return null;
      long parameters = BitConverter.ToInt64(peb, 0);
      var head = Read(h, parameters, 0x400); if (head == null) return null;
      int cwdLength = BitConverter.ToUInt16(head, 0x38);
      var cwd = Read(h, BitConverter.ToInt64(head, 0x40), cwdLength);
      long envSize = BitConverter.ToInt64(head, 0x3F0);
      var env = Read(h, BitConverter.ToInt64(head, 0x80), (int)Math.Min(Math.Max(envSize, 0), 262144));
      string wt = "", profile = "";
      if (env != null) foreach (var entry in Encoding.Unicode.GetString(env).Split('\0')) {
        if (entry.StartsWith("WT_SESSION=")) wt = entry.Substring(11);
        if (entry.StartsWith("OMP_PROFILE=")) profile = entry.Substring(12);
      }
      return new[] { cwd == null ? "" : Encoding.Unicode.GetString(cwd), wt, profile };
    } finally { CloseHandle(h); }
  }
}
'@
$rows = @()
foreach ($p in Get-CimInstance Win32_Process -Filter "Name='omp.exe'") {
  $line = [string]$p.CommandLine
  # Workers, daemons, RPC and print runs have no console of their own.
  if ($line -match '__omp_|--mode|\s-p(\s|$)|--print') { continue }
  $data = [NterPeb]::Inspect([int]$p.ProcessId)
  if (-not $data) { continue }
  $rows += @{ pid = [int]$p.ProcessId; started = $p.CreationDate.ToUniversalTime().ToString('o'); cwd = $data[0]; wtSession = $data[1]; profile = $data[2] }
}
ConvertTo-Json -Compress -InputObject @($rows)
`;
const Row = z.object({ pid: z.number().int().positive(), started: z.string(), cwd: z.string(), wtSession: z.string(), profile: z.string() });

/** Interactive omp consoles that run without the office bridge (opened before it was installed). */
export async function findLegacyConsoles(connectedPids: ReadonlySet<number>): Promise<AgentInfo[]> {
  if (process.platform !== 'win32') return [];
  const output = await new Promise<string>((resolve, reject) => execFile('powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
    { windowsHide: true, timeout: 20000, maxBuffer: 1048576 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  const rows = z.array(Row).parse(JSON.parse(output.trim() || '[]'));
  const agents: AgentInfo[] = [];
  for (const row of rows) {
    if (connectedPids.has(row.pid) || !row.cwd) continue;
    const cwd = row.cwd.replace(/\\+$/, '') || row.cwd;
    const sessionFile = row.wtSession ? await terminalSession(row.wtSession, row.profile, cwd) : null;
    const sessionId = sessionFile?.match(/_([^_\\/]+)\.jsonl$/)?.[1] ?? 'pid-' + row.pid;
    agents.push({
      ref: { instanceId: 'legacy', generation: row.pid + '@' + row.started, sessionId, agentId: 'console-' + row.pid },
      parent: null, name: 'Consola sin conectar', cwd, model: null, thinking: null, phase: 'unknown', activity: '',
      queued: 0, pendingAsync: false, runningChildren: 0, terminal: null, conversation: null, connected: false,
    });
  }
  return agents;
}
/** omp records `<cwd>\n<session file>` per Windows Terminal pane; trust it only when the folder matches. */
async function terminalSession(wtSession: string, profile: string, cwd: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(wtSession)) return null;
  const agentDir = profile ? join(homedir(), '.omp', 'profiles', profile, 'agent') : join(homedir(), '.omp', 'agent');
  try {
    const [recordedCwd, sessionFile] = (await readFile(join(agentDir, 'terminal-sessions', 'wt-' + wtSession), 'utf8')).split(/\r?\n/);
    return recordedCwd?.toLowerCase() === cwd.toLowerCase() && sessionFile ? sessionFile : null;
  } catch { return null; }
}
