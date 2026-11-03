import { execFile } from 'node:child_process';
import { join } from 'node:path';

export type UsageResult = { ok: true; text: string } | { ok: false; message: string };

const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const ANSI_ESCAPE = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[@-_])|\u009B[0-?]*[ -/]*[@-~]/g;
const TERMINAL_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
export function cleanUsageOutput(output: string): string {
  return output.replace(ANSI_ESCAPE, '').replace(/\r\n?/g, '\n').replace(TERMINAL_CONTROLS, '')
    .replace(/⚠\uFE0F?/g, 'Aviso:').replace(/[●○✦]/g, '').replace(/[█░]+/g, '')
    .replace(/ · /g, ' | ').replace(/ → /g, ': ').replace(/×/g, ' x ').replace(/  +/g, ' ')
    .replace(/\b5 hours\b/g, '5 horas').replace(/\b7 days\b/g, '7 días')
    .replace(/\bresets in\b/g, 'se reinicia en').replace(/\bsaved resets\b/g, 'reinicios guardados')
    .replace(/\bsoonest expires in\b/g, 'el primero caduca en').replace(/\bquota left\b/g, 'cuota restante')
    .replace(/\bno usage data\b/g, 'sin datos de uso').replace(/\bre-login within\b/g, 'vuelve a iniciar sesión antes de')
    .replace(/\bused\b/g, 'usado').replace(/\baccount(s?)\b/g, (_, plural: string) => plural ? 'cuentas' : 'cuenta')
    .replace(/\bcapacity:/g, 'Capacidad:').replace(/\bfetched\b/g, 'actualizado hace').replace(/\bago\b/g, '')
    .split('\n').map(line => line.trim()).join('\n').trim();
}
let inFlight: Promise<UsageResult> | undefined;

export function fetchUsage(): Promise<UsageResult> {
  if (inFlight) return inFlight;
  inFlight = runUsage().finally(() => { inFlight = undefined; });
  return inFlight;
}

function runUsage(): Promise<UsageResult> {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return Promise.resolve({ ok: false, message: 'No se encontró el ejecutable local de omp.' });

  const { promise, resolve } = Promise.withResolvers<UsageResult>();
  execFile(join(localAppData, 'omp', 'omp.exe'), ['usage', '--redact'], {
    windowsHide: true,
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  }, (error, stdout) => {
    if (error) {
      if (error.code === 'ENOENT') {
        resolve({ ok: false, message: 'No se encontró el ejecutable local de omp.' });
      } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        resolve({ ok: false, message: 'La respuesta de omp usage superó el límite de salida.' });
      } else if (error.code === 'ETIMEDOUT' || error.killed) {
        resolve({ ok: false, message: 'La consulta de omp usage superó el límite de 60 segundos.' });
      } else if (typeof error.code === 'number') {
        resolve({ ok: false, message: `omp usage falló (código de salida ${error.code}).` });
      } else {
        resolve({ ok: false, message: 'No se pudo ejecutar omp usage.' });
      }
      return;
    }

    const text = cleanUsageOutput(stdout);
    resolve(text
      ? { ok: true, text }
      : { ok: false, message: 'omp usage no devolvió información.' });
  });
  return promise;
}
