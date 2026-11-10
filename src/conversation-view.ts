import { open } from 'node:fs/promises';
import { z } from 'zod';

const Entry = z.object({
  id: z.string(), type: z.string(), parentId: z.string().nullable().optional(),
  activeLeafId: z.string().nullable().optional(),
  message: z.unknown().optional(),
});
const Message = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]).optional(),
});

export type ConversationMessage = { role: 'user' | 'assistant'; text: string };

/** Read a bounded snapshot without opening the session for writing. */
export async function readConversation(file: string): Promise<ConversationMessage[]> {
  if (!file.toLowerCase().endsWith('.jsonl')) throw new Error('Este formato de sesión no se puede mostrar aquí. Ábrelo en la consola.');
  const handle = await open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    if (size > 32 * 1024 * 1024) throw new Error('La conversación es demasiado grande para mostrarla aquí. Ábrela en la consola.');
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
    const entries = new Map<string, { parentId: string | null; message?: ConversationMessage }>();
    let leaf: string | null = null, lastSelfSelected: string | null = null;
    for (const line of lines) {
      let raw: unknown;
      if (!line.trim()) continue;
      try { raw = JSON.parse(line); } catch { throw new Error('El archivo está incompleto o se está escribiendo. Inténtalo de nuevo en unos segundos.'); }
      const parsed = Entry.safeParse(raw);
      if (!parsed.success) continue;
      const entry = parsed.data;
      if (entry.type === 'session') continue;
      let message: ConversationMessage | undefined;
      const parsedMessage = entry.type === 'message' ? Message.safeParse(entry.message) : null;
      if (parsedMessage?.success) {
        const { role, content } = parsedMessage.data;
        const text = typeof content === 'string' ? content : Array.isArray(content)
          ? content.filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n') : '';
        if (text) message = { role, text };
      }
      entries.set(entry.id, { parentId: entry.parentId ?? null, message });
      leaf = entry.activeLeafId !== undefined ? entry.activeLeafId : entry.id;
      if (leaf === entry.id) lastSelfSelected = entry.id;
    }
    if (leaf && !entries.has(leaf)) leaf = lastSelfSelected;
    const messages: ConversationMessage[] = [], visited = new Set<string>();
    while (leaf && !visited.has(leaf)) {
      visited.add(leaf);
      const entry = entries.get(leaf);
      if (!entry) throw new Error('La rama de esta conversación está incompleta. Ábrela en la consola.');
      if (entry.message) messages.push(entry.message);
      leaf = entry.parentId;
    }
    if (leaf) throw new Error('La rama de esta conversación está incompleta. Ábrela en la consola.');
    return messages.reverse();
  } finally { await handle.close(); }
}
