import { expect, test } from 'bun:test';
import AdmZip from 'adm-zip';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractCatalogZip } from '../src/catalog-archive.ts';

function archive(entries: Array<[string, string, number?]>): string {
  const zip = new AdmZip();
  for (const [name, contents, attr] of entries) {
    const entry = zip.addFile(name, Buffer.from(contents));
    entry.entryName = name;
    if (attr !== undefined) entry.attr = attr >>> 0;
  }
  return zip.toBuffer().toString('base64');
}

test('extracts the skill directory and its auxiliary files and cleans up', async () => {
  const result = await extractCatalogZip(archive([
    ['wrapper/skill/SKILL.md', 'instructions'],
    ['wrapper/skill/resources/data.txt', 'resource'],
  ]));
  try {
    expect(await readFile(join(result.directory, 'SKILL.md'), 'utf8')).toBe('instructions');
    expect(await readFile(join(result.directory, 'resources', 'data.txt'), 'utf8')).toBe('resource');
  } finally { await result.cleanup(); }
  await expect(readFile(join(result.directory, 'SKILL.md'))).rejects.toThrow();
});

test('rejects malformed input, dangerous names and ambiguous skills', async () => {
  for (const input of [
    'not base64!',
    Buffer.from('not a zip').toString('base64'),
    archive([['SKILL.md', 'ok'], ['../escape.txt', 'bad']]),
    archive([['SKILL.md', 'ok'], ['CON.txt', 'bad']]),
    archive([['SKILL.md', 'ok'], ['file:stream', 'bad']]),
    archive([['a/SKILL.md', 'one'], ['b/SKILL.md', 'two']]),
    archive([['SKILL.md', 'ok'], ['Data.txt', 'a'], ['data.TXT', 'b']]),
    archive([['SKILL.md', 'ok'], ['link', 'target', 0o120777 << 16]]),
  ]) await expect(extractCatalogZip(input)).rejects.toThrow();
});
