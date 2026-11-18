import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
const Link = z.object({ version: z.literal(1), access: z.literal('control'), generation: z.literal(1), url: z.string() });

export function controlLink(stdout: string): string | null {
  try {
    const reply = Link.parse(JSON.parse(stdout));
    const url = new URL(reply.url);
    return !url.username && !url.password && url.hash && (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ? reply.url : null;
  } catch { return null; }
}

// The picker supplies a folder, never a command. The overlay applies only to this omp process.
const START = String.raw`
$ErrorActionPreference = 'Stop'
$arguments = '--allow-home --config "' + $env:NTER_COLLAB_CONFIG + '"'
$process = Start-Process -FilePath $env:NTER_COLLAB_OMP -WorkingDirectory $env:NTER_COLLAB_CWD -ArgumentList $arguments -PassThru
[Console]::WriteLine($process.Id)
`;

export async function startSharedSession(omp: string, dataDir: string, cwd: string): Promise<string | null> {
  const config = join(dataDir, 'shared-session.yml');
  await mkdir(dataDir, { recursive: true });
  await writeFile(config, 'autoResume: false\ncollab:\n  autoStart: control\ngenerate_image:\n  enabled: true\n');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OMP_PROFILE;
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', START], {
    cwd: dataDir, windowsHide: true, timeout: 10000,
    env: { ...env, NTER_COLLAB_OMP: omp, NTER_COLLAB_CONFIG: config, NTER_COLLAB_CWD: cwd },
  });
  const pid = stdout.trim();
  if (!/^[1-9]\d*$/.test(pid)) throw new Error('No se recibió el proceso de la sesión');
  const deadline = Date.now() + 25000;
  // The native CLI selects the exact PID and rejects stale room generations. It keeps the secret out of argv.
  do {
    try {
      const { stdout } = await run(omp, ['collab', 'link', pid, '--json'], {
        cwd: dataDir, env, windowsHide: true, timeout: 5000, maxBuffer: 65536,
      });
      return controlLink(stdout);
    } catch {
      // No room is published until the relay connects.
      if (Date.now() < deadline) await delay(1000);
    }
  } while (Date.now() < deadline);
  return null;
}
