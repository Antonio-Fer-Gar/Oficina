import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importManagedSkill, listManagedSkills, setManagedSkillEnabled } from '../src/skills.ts';

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
