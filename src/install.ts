import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The bridge is installed through omp's own discovery: <agentDir>/extensions/<name>/index.js.
// Nothing else in the profile (config.yml, settings, other extensions) is ever read or written.
const FOLDER = 'nter-office', MARKER = '.nter-office.json';
export interface InstallPlan {
  profile: string; agentDir: string; target: string; source: string;
  action: 'install' | 'update' | 'unchanged' | 'remove' | 'absent' | 'refuse';
  reason: string;
}
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function agentDirFor(profile: string, home = homedir()): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile)) throw new Error('Nombre de perfil no válido: ' + profile);
  return profile === 'default' ? join(home, '.omp', 'agent') : join(home, '.omp', 'profiles', profile, 'agent');
}
function ownership(target: string): { ours: boolean; intact: boolean } {
  const marker = join(target, MARKER), index = join(target, 'index.js');
  if (!existsSync(marker)) return { ours: false, intact: false };
  try {
    const recorded = JSON.parse(readFileSync(marker, 'utf8')) as { sha256?: string };
    return { ours: true, intact: existsSync(index) && digest(readFileSync(index)) === recorded.sha256 };
  } catch { return { ours: false, intact: false }; }
}
export function planBridgeInstall(options: { source: string; profile: string; home?: string; remove?: boolean }): InstallPlan {
  const agentDir = agentDirFor(options.profile, options.home), target = join(agentDir, 'extensions', FOLDER);
  const base = { profile: options.profile, agentDir, target, source: options.source };
  const exists = existsSync(target), owner = ownership(target);
  if (options.remove) {
    if (!exists) return { ...base, action: 'absent', reason: 'No está instalado' };
    if (!owner.ours) return { ...base, action: 'refuse', reason: 'La carpeta no fue creada por la oficina; no se toca' };
    if (!owner.intact) return { ...base, action: 'refuse', reason: 'El puente fue modificado después de instalarlo; retíralo a mano si quieres' };
    return { ...base, action: 'remove', reason: 'Retirar solo la carpeta del puente' };
  }
  if (!existsSync(options.source)) throw new Error('No existe el puente compilado: ' + options.source + ' (ejecuta bun run build)');
  if (!exists) return { ...base, action: 'install', reason: 'Crear la carpeta del puente' };
  if (!owner.ours) return { ...base, action: 'refuse', reason: 'Ya existe una carpeta con ese nombre que no es de la oficina' };
  if (!owner.intact) return { ...base, action: 'refuse', reason: 'El puente instalado fue modificado; no se sobrescribe' };
  const same = digest(readFileSync(join(target, 'index.js'))) === digest(readFileSync(options.source));
  return { ...base, action: same ? 'unchanged' : 'update', reason: same ? 'Ya está al día' : 'Actualizar el puente instalado' };
}
export function applyBridgeInstall(plan: InstallPlan): void {
  if (plan.action === 'install' || plan.action === 'update') {
    const bytes = readFileSync(plan.source);
    mkdirSync(plan.target, { recursive: true });
    writeFileSync(join(plan.target, 'index.js'), bytes);
    writeFileSync(join(plan.target, MARKER), JSON.stringify({ sha256: digest(bytes), installedAt: new Date().toISOString() }));
  } else if (plan.action === 'remove') rmSync(plan.target, { recursive: true });
  else if (plan.action === 'refuse') throw new Error(plan.reason);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const profiles = args.flatMap((value, index) => args[index - 1] === '--profile' ? [value] : []);
  const plans = (profiles.length ? profiles : ['default']).map(profile =>
    planBridgeInstall({ source: join(import.meta.dir, '..', 'dist', 'extension.js'), profile, remove: args.includes('--remove') }));
  for (const plan of plans) console.log(`[${plan.profile}] ${plan.action}: ${plan.target} — ${plan.reason}`);
  if (!args.includes('--apply')) { console.log('Simulación: no se ha cambiado nada. Repite con --apply para aplicarlo.'); process.exit(0); }
  for (const plan of plans) applyBridgeInstall(plan);
  console.log('Hecho. Las consolas omp ya abiertas cargarán el puente al reiniciarlas; las nuevas lo cargan solas.');
}
