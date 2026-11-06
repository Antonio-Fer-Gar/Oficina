import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface ManagedSkill { id: string; name: string; description: string; enabled: boolean }
export interface InstalledSkill { name: string; description: string; source: string; manual: boolean }

const marker = '.office-managed-skill';
const safeName = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const queues = new Map<string, Promise<unknown>>();

function validName(name: string): boolean {
  return name.length <= 64 && safeName.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name);
}

async function directory(path: string): Promise<void> {
  try { await mkdir(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`No es una carpeta segura: ${path}`);
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function copyTree(source: string, destination: string): Promise<void> {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error('No se permiten enlaces simbólicos en una skill');
  if (stat.isDirectory()) {
    await mkdir(destination);
    for (const entry of await readdir(source)) await copyTree(join(source, entry), join(destination, entry));
  } else if (stat.isFile()) {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } else throw new Error('La skill contiene un archivo no permitido');
}

function metadata(text: string): { name: string; description: string } {
  const match = text.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('SKILL.md necesita metadatos de cabecera');
  const lines = match[1]!.split(/\r?\n/);
  const values: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i]!.match(/^(name|description):\s*(.*?)\s*$/);
    if (!field) continue;
    if (values[field[1]!] !== undefined) throw new Error('Metadatos duplicados');
    let value = field[2]!;
    if (/^[>|][+-]?$/.test(value)) {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim());
      value = parts.join(value.startsWith('>') ? ' ' : '\n');
    } else if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error('Metadatos inválidos'); }
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length < 2) throw new Error('Metadatos inválidos');
      value = value.slice(1, -1).replace(/''/g, "'");
    } else value = value.replace(/\s+#.*$/, '').trim();
    if (typeof value !== 'string') throw new Error('Metadatos inválidos');
    values[field[1]!] = value;
  }
  if (!validName(values.name ?? '') || !values.description?.trim()) throw new Error('Nombre o descripción de skill inválidos');
  return { name: values.name!, description: values.description.trim() };
}

async function setup(home: string, dataDir: string) {
  await mkdir(home, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await directory(join(home, '.agents'));
  await directory(join(home, '.agents', 'skills'));
  await directory(join(home, '.agents', 'rules'));
  const store = join(dataDir, 'managed-skills');
  await directory(store);
  return { store, active: join(home, '.agents', 'skills'), rules: join(home, '.agents', 'rules'), quarantine: join(home, '.agents') };
}

async function locked<T>(home: string, dataDir: string, action: (paths: { store: string; active: string; rules: string; quarantine: string }) => Promise<T>): Promise<T> {
  const key = resolve(dataDir);
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => action(await setup(home, dataDir)));
  queues.set(key, current);
  try { return await current; } finally { if (queues.get(key) === current) queues.delete(key); }
}

async function readRecord(store: string, id: string): Promise<ManagedSkill> {
  if (!safeId.test(id)) throw new Error('Identificador de skill inválido');
  const dir = join(store, id);
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Registro de skill inválido');
  const file = join(dir, 'record.json');
  const recordStat = await lstat(file);
  if (!recordStat.isFile() || recordStat.isSymbolicLink()) throw new Error('Registro de skill inválido');
  const value: ManagedSkill = JSON.parse(await readFile(file, 'utf8'));
  if (!value || value.id !== id || typeof value.name !== 'string' || !validName(value.name) || typeof value.description !== 'string' || !value.description.trim() || typeof value.enabled !== 'boolean') throw new Error('Registro de skill inválido');
  return value;
}

async function records(store: string): Promise<ManagedSkill[]> {
  const result: ManagedSkill[] = [];
  for (const id of await readdir(store)) {
    if (safeId.test(id)) result.push(await readRecord(store, id));
  }
  return result;
}

async function saveRecord(store: string, skill: ManagedSkill): Promise<void> {
  const dir = join(store, skill.id), temp = join(dir, `record-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(skill), { flag: 'wx' });
    await rename(temp, join(dir, 'record.json'));
  } finally { await rm(temp, { force: true }); }
}

async function assertOwned(path: string, id: string): Promise<void> {
  const stat = await lstat(path);
  const markerStat = await lstat(join(path, marker));
  if (!stat.isDirectory() || stat.isSymbolicLink() || !markerStat.isFile() || markerStat.isSymbolicLink() || await readFile(join(path, marker), 'utf8') !== id) throw new Error('La carpeta ya no pertenece a esta oficina');
}
function ruleBody(name: string): string {
  return `---\nalwaysApply: true\n---\nAt the start of each task, read skill://${name} and follow its instructions when applicable.\n`;
}
function rulePath(rules: string, id: string): string {
  return join(rules, `oficina-skill-${id}.md`);
}


export async function listManagedSkills(home: string, dataDir: string): Promise<ManagedSkill[]> {
  return locked(home, dataDir, async ({ store }) => records(store));
}
export function parseInstalledSkills(value: unknown, home: string, managed: ManagedSkill[]): InstalledSkill[] {
  if (!value || typeof value !== 'object' || !('skills' in value) || !Array.isArray(value.skills)) {
    throw new Error('omp devolvió un listado de skills no válido.');
  }
  const managedPaths = new Set(managed.filter(skill => skill.enabled).map(skill => resolve(home, '.agents', 'skills', skill.name, 'SKILL.md').toLowerCase()));
  return value.skills.flatMap((item: unknown): InstalledSkill[] => {
    if (!item || typeof item !== 'object') return [];
    const skill = item as Record<string, unknown>;
    if (typeof skill.name !== 'string' || typeof skill.description !== 'string' || typeof skill.source !== 'string'
      || typeof skill.filePath !== 'string' || !skill.source.endsWith(':user')
      || managedPaths.has(resolve(skill.filePath).toLowerCase())) return [];
    return [{ name: skill.name, description: skill.description, source: skill.source, manual: skill.hide === true }];
  });
}

export async function listInstalledSkills(home: string, dataDir: string): Promise<InstalledSkill[]> {
  const managed = await listManagedSkills(home, dataDir);
  const executable = join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'omp', 'omp.exe');
  const output = await new Promise<string>((resolveOutput, reject) => {
    execFile(executable, ['skill', 'list', dataDir, '--json'], { cwd: dataDir, windowsHide: true, timeout: 20_000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout) => error ? reject(new Error('No se pudo consultar el listado de skills de omp.')) : resolveOutput(stdout));
  });
  let value: unknown;
  try { value = JSON.parse(output); } catch { throw new Error('omp devolvió un listado de skills no válido.'); }
  return parseInstalledSkills(value, home, managed);
}


export async function importManagedSkill(home: string, dataDir: string, sourceDir: string, expectedName?: string): Promise<ManagedSkill[]> {
  return locked(home, dataDir, async ({ store, active, rules }) => {
    const sourceStat = await lstat(sourceDir);
    const singleFile = sourceStat.isFile() && basename(sourceDir) === 'SKILL.md';
    if (sourceStat.isSymbolicLink() || (!sourceStat.isDirectory() && !singleFile)) throw new Error('Seleccione una carpeta o un SKILL.md válido');
    let skillDir = sourceDir;
    if (!singleFile && !await exists(join(skillDir, 'SKILL.md'))) {
      const candidates: string[] = [];
      for (const entry of await readdir(skillDir, { withFileTypes: true })) {
        if (entry.isDirectory() && await exists(join(skillDir, entry.name, 'SKILL.md'))) candidates.push(join(skillDir, entry.name));
      }
      if (candidates.length > 1) throw new Error('La carpeta contiene varias skills. Selecciona la carpeta de una sola skill.');
      if (!candidates.length) throw new Error('No se encontró SKILL.md en la carpeta seleccionada ni en sus subcarpetas inmediatas.');
      skillDir = candidates[0]!;
    }
    const skillPath = singleFile ? sourceDir : join(skillDir, 'SKILL.md');
    if (!await exists(skillPath)) throw new Error('No se encontró SKILL.md en la carpeta seleccionada.');
    const skillFile = await lstat(skillPath);
    if (!skillFile.isFile() || skillFile.isSymbolicLink()) throw new Error('Seleccione una carpeta con SKILL.md válido');
    const info = metadata(await readFile(skillPath, 'utf8'));
    if (expectedName !== undefined && info.name !== expectedName) throw new Error('El nombre de la skill descargada no coincide con el catálogo.');
    const id = randomUUID(), recordDir = join(store, id), destination = join(active, info.name);
    if ((await records(store)).some(skill => skill.name === info.name)) throw new Error('La skill ya está adjuntada');
    if (await exists(destination)) throw new Error(`Ya existe una skill llamada "${info.name}". No se ha sobrescrito; revisa la skill instalada.`);
    await mkdir(recordDir);
    let reserved = false, ruleCreated = false;
    try {
      // Reserve the global name atomically; copyTree must not overwrite any existing entry.
      try { await mkdir(destination); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Ya existe una skill llamada "${info.name}". No se ha sobrescrito; revisa la skill instalada.`);
        throw error;
      }
      reserved = true;
      if (singleFile) await copyTree(skillPath, join(destination, 'SKILL.md'));
      else for (const entry of await readdir(skillDir)) await copyTree(join(skillDir, entry), join(destination, entry));
      await writeFile(join(destination, marker), id, { flag: 'wx' });
      await writeFile(rulePath(rules, id), ruleBody(info.name), { flag: 'wx' });
      ruleCreated = true;
      await saveRecord(store, { id, ...info, enabled: true });
    } catch (error) {
      if (ruleCreated) await rm(rulePath(rules, id), { force: true });
      if (reserved) await rm(destination, { recursive: true, force: true });
      await rm(recordDir, { recursive: true, force: true });
      throw error;
    }
    return records(store);
  });
}

export async function setManagedSkillEnabled(home: string, dataDir: string, id: string, enabled: boolean): Promise<ManagedSkill[]> {
  if (typeof enabled !== 'boolean') throw new Error('Estado de skill inválido');
  return locked(home, dataDir, async ({ store, active, rules, quarantine }) => {
    const skill = await readRecord(store, id);
    if (skill.enabled === enabled) return records(store);
    const globalDir = join(active, skill.name), disabled = join(store, id, 'disabled');
    const source = enabled ? disabled : globalDir;
    const destination = enabled ? globalDir : disabled;
    await assertOwned(source, id);
    if (await exists(destination)) throw new Error('Ya existe una carpeta en el destino de la skill');
    const backup = join(enabled ? join(store, id) : quarantine, `.office-skill-${randomUUID()}`);
    const rule = rulePath(rules, id), ruleBackup = join(rules, `.oficina-rule-${randomUUID()}`);
    if (!enabled) {
      const stat = await lstat(rule);
      if (!stat.isFile() || stat.isSymbolicLink() || await readFile(rule, 'utf8') !== ruleBody(skill.name)) throw new Error('La regla de esta skill ha cambiado; no se modificará');
    }
    // Move the original aside on its own volume before copying; it remains intact until commit.
    await rename(source, backup);
    let reserved = false, ruleChanged = false;
    try {
      await mkdir(destination);
      reserved = true;
      for (const entry of await readdir(backup)) await copyTree(join(backup, entry), join(destination, entry));
      if (enabled) await writeFile(rule, ruleBody(skill.name), { flag: 'wx' });
      else await rename(rule, ruleBackup);
      ruleChanged = true;
      await saveRecord(store, { ...skill, enabled });
    } catch (error) {
      if (ruleChanged) {
        if (enabled) await rm(rule, { force: true });
        else await rename(ruleBackup, rule);
      }
      if (reserved) await rm(destination, { recursive: true, force: true });
      if (!await exists(source)) await rename(backup, source);
      throw error;
    }
    // A failed cleanup retains a harmless backup instead of risking the committed copy.
    await rm(backup, { recursive: true, force: true }).catch(() => {});
    if (!enabled) await rm(ruleBackup, { force: true }).catch(() => {});
    return records(store);
  });
}
