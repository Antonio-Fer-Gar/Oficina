import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importManagedSkill, listManagedSkills, parseInstalledSkills, setManagedSkillEnabled } from '../src/skills.ts';

async function fixture(run: (root: string, home: string, data: string, source: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'office-skills-'));
  const home = join(root, 'home'), data = join(root, 'data'), source = join(root, 'source');
  try {
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'SKILL.md'), '---\nname: example-skill\ndescription: Useful example\n---\nInstructions\n');
    await mkdir(join(source, 'resources'));
    await writeFile(join(source, 'resources', 'data.txt'), 'preserved');
    await run(root, home, data, source);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('lists global omp skills including manual ones without duplicating office skills or including project skills', () => {
  const home = join(tmpdir(), 'skill-list-home');
  const result = parseInstalledSkills({ skills: [
    { name: 'brainstorming', description: 'Plan ideas', source: 'agents:user', filePath: join(home, '.agents', 'skills', 'brainstorming', 'SKILL.md'), hide: false },
    { name: 'manual', description: 'Manual only', source: 'agents:user', filePath: join(home, '.agents', 'skills', 'manual', 'SKILL.md'), hide: true },
    { name: 'managed', description: 'Managed', source: 'agents:user', filePath: join(home, '.agents', 'skills', 'managed', 'SKILL.md'), hide: false },
    { name: 'local', description: 'Project only', source: 'agents:project', filePath: join(home, 'project', 'SKILL.md'), hide: false },
  ] }, home, [{ id: 'id', name: 'managed', description: 'Managed', enabled: true }]);
  expect(result).toEqual([
    { name: 'brainstorming', description: 'Plan ideas', source: 'agents:user', manual: false },
    { name: 'manual', description: 'Manual only', source: 'agents:user', manual: true },
  ]);
});

describe('managed skills', () => {
  test('imports and toggles a skill without losing auxiliary files', async () => fixture(async (_root, home, data, source) => {
    const [skill] = await importManagedSkill(home, data, source);
    expect(skill).toMatchObject({ name: 'example-skill', description: 'Useful example', enabled: true });
    const active = join(home, '.agents', 'skills', 'example-skill');
    expect(await readFile(join(active, 'resources', 'data.txt'), 'utf8')).toBe('preserved');
    expect((await setManagedSkillEnabled(home, data, skill!.id, false))[0]?.enabled).toBe(false);
    await expect(readFile(join(active, 'SKILL.md'))).rejects.toThrow();
    expect((await listManagedSkills(home, data))[0]?.enabled).toBe(false);
    expect((await setManagedSkillEnabled(home, data, skill!.id, true))[0]?.enabled).toBe(true);
    expect(await readFile(join(active, 'resources', 'data.txt'), 'utf8')).toBe('preserved');
  }));

  test('imports a downloaded wrapper folder containing one skill and its resources', async () => fixture(async (_root, home, data, source) => {
    const [skill] = await importManagedSkill(home, data, join(source, '..'));
    expect(skill).toMatchObject({ name: 'example-skill', enabled: true });
    expect(await readFile(join(home, '.agents', 'skills', 'example-skill', 'resources', 'data.txt'), 'utf8')).toBe('preserved');
  }));

  test('does not guess when a folder contains multiple skills', async () => fixture(async (root, home, data, source) => {
    const second = join(root, 'other');
    await mkdir(second);
    await writeFile(join(second, 'SKILL.md'), '---\nname: other-skill\ndescription: Another skill\n---\nInstructions\n');
    await expect(importManagedSkill(home, data, root)).rejects.toThrow(/varias|varios/i);
    expect(await listManagedSkills(home, data)).toEqual([]);
    expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('example-skill');
  }));

  test('refuses a catalog download whose metadata names a different skill', async () => fixture(async (_root, home, data, source) => {
    await expect(importManagedSkill(home, data, source, 'different-skill')).rejects.toThrow(/no coincide/i);
    expect(await listManagedSkills(home, data)).toEqual([]);
    await expect(readFile(join(home, '.agents', 'skills', 'example-skill', 'SKILL.md'))).rejects.toThrow();
  }));

  test('imports a selected SKILL.md without copying neighboring files', async () => fixture(async (_root, home, data, source) => {
    const [skill] = await importManagedSkill(home, data, join(source, 'SKILL.md'));
    const active = join(home, '.agents', 'skills', 'example-skill');
    expect(skill?.name).toBe('example-skill');
    expect(await readFile(join(active, 'SKILL.md'), 'utf8')).toContain('Useful example');
    await expect(readFile(join(active, 'resources', 'data.txt'))).rejects.toThrow();
  }));

  test('rejects global collisions and leaves the unrelated skill intact', async () => fixture(async (_root, home, data, source) => {
    const active = join(home, '.agents', 'skills', 'example-skill');
    await mkdir(active, { recursive: true });
    await writeFile(join(active, 'SKILL.md'), 'unrelated');
    await expect(importManagedSkill(home, data, source)).rejects.toThrow();
    expect(await readFile(join(active, 'SKILL.md'), 'utf8')).toBe('unrelated');
    expect(await listManagedSkills(home, data)).toEqual([]);
  }));

  test('does not overwrite a skill created while the managed one is disabled', async () => fixture(async (_root, home, data, source) => {
    const [skill] = await importManagedSkill(home, data, source);
    await setManagedSkillEnabled(home, data, skill!.id, false);
    const active = join(home, '.agents', 'skills', 'example-skill');
    await mkdir(active);
    await writeFile(join(active, 'SKILL.md'), 'other');
    await expect(setManagedSkillEnabled(home, data, skill!.id, true)).rejects.toThrow();
    expect(await readFile(join(active, 'SKILL.md'), 'utf8')).toBe('other');
    expect((await listManagedSkills(home, data))[0]?.enabled).toBe(false);
  }));

  test('rejects unsafe metadata, arbitrary ids and symbolic links', async () => fixture(async (root, home, data, source) => {
    await writeFile(join(source, 'SKILL.md'), '---\nname: ../escape\ndescription: bad\n---\n');
    await expect(importManagedSkill(home, data, source)).rejects.toThrow();
    await expect(setManagedSkillEnabled(home, data, '../escape', false)).rejects.toThrow();
    await writeFile(join(source, 'SKILL.md'), '---\nname: example-skill\ndescription: safe\n---\n');
    const outside = join(root, 'outside');
    await writeFile(outside, 'private');
    try { await symlink(outside, join(source, 'link')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    await expect(importManagedSkill(home, data, source)).rejects.toThrow();
    expect(await readFile(outside, 'utf8')).toBe('private');
    expect(await listManagedSkills(home, data)).toEqual([]);
  }));
});
