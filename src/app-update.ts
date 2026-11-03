const PACKAGE_URL = 'https://raw.githubusercontent.com/Antonio-Fer-Gar/Oficina/main/package.json';
export const APP_UPDATE_URL = 'https://github.com/Antonio-Fer-Gar/Oficina';
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CHECK_TIMEOUT_MS = 5_000;

export async function checkAppUpdate(currentVersion: string, request: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<{ version: string; currentVersion: string } | null> {
  const current = VERSION.exec(currentVersion);
  if (!current) return null;

  try {
    const response = await request(PACKAGE_URL, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();

    if (typeof data !== 'object' || data === null || Array.isArray(data) || !('version' in data)) return null;
    const version = data.version;
    if (typeof version !== 'string') return null;
    const available = VERSION.exec(version);
    if (!available) return null;

    for (let index = 1; index <= 3; index++) {
      const next = available[index];
      const installed = current[index];
      if (next.length !== installed.length) return next.length > installed.length ? { version, currentVersion } : null;
      if (next !== installed) return next > installed ? { version, currentVersion } : null;
    }
    return null;
  } catch {
    return null;
  }
}
