import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConversation } from '../src/conversation-view.ts';

test('reads only text on the selected branch without modifying the session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nter-transcript-'));
  const file = join(dir, 'session.jsonl');
  const original = [
    { type: 'session', id: 'session' },
    { type: 'message', id: 'a', parentId: null, message: { role: 'user', content: 'Hola' } },
    { type: 'message', id: 'b', parentId: 'a', message: { role: 'assistant', content: [{ type: 'text', text: 'Descartado' }] } },
    { type: 'message', id: 'c', parentId: 'a', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'secreto' }, { type: 'text', text: 'Respuesta' }] } },
  ].map(value => JSON.stringify(value)).join('\n');
  try {
    await writeFile(file, original);
    expect(await readConversation(file)).toEqual([{ role: 'user', text: 'Hola' }, { role: 'assistant', text: 'Respuesta' }]);
    expect(await readFile(file, 'utf8')).toBe(original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('honors off-branch entries and reports incomplete files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nter-transcript-'));
  const file = join(dir, 'session.jsonl');
  try {
    await writeFile(file, [
      { type: 'message', id: 'a', parentId: null, message: { role: 'user', content: 'Original' } },
      { type: 'message', id: 'b', parentId: 'a', message: { role: 'assistant', content: 'Respuesta' } },
      { type: 'model_usage', id: 'c', parentId: 'a', activeLeafId: 'b' },
    ].map(value => JSON.stringify(value)).join('\n'));
    expect(await readConversation(file)).toEqual([{ role: 'user', text: 'Original' }, { role: 'assistant', text: 'Respuesta' }]);
    await writeFile(file, '{"type":"message"');
    await expect(readConversation(file)).rejects.toThrow('incompleto');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
