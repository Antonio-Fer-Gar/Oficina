import { Database } from 'bun:sqlite';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, win32 } from 'node:path';
import { z } from 'zod';
import { ConversationSchema, type Conversation, type ConversationRecord } from './conversation.ts';

const Identifier = z.string().min(1).max(4096).refine(value => !value.includes('\0'));
const Timestamp = z.iso.datetime({ offset: true });

export interface HistoryStore {
  upsert(conversation: Conversation): void;
  listRecent(now: Date): ConversationRecord[];
  close(): void;
}

/** Catalog metadata only. OMP remains the owner of its conversation files. */
export function openHistory(path: string): HistoryStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS conversations (
      profile TEXT NOT NULL, sessionId TEXT NOT NULL, project TEXT NOT NULL,
      cwd TEXT NOT NULL, title TEXT NOT NULL, sessionFile TEXT,
      openedAt TEXT NOT NULL, lastActiveAt TEXT NOT NULL, lastActiveMs INTEGER NOT NULL,
      closedAt TEXT, PRIMARY KEY (profile, sessionId)
    );
    CREATE INDEX IF NOT EXISTS conversations_recent ON conversations(lastActiveMs DESC);
  `);
  const upsert = db.query(`
    INSERT INTO conversations (profile, sessionId, project, cwd, title, sessionFile, openedAt, lastActiveAt, lastActiveMs, closedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile, sessionId) DO UPDATE SET
      project = excluded.project, cwd = excluded.cwd, title = excluded.title,
      sessionFile = excluded.sessionFile,
      openedAt = min(conversations.openedAt, excluded.openedAt),
      lastActiveAt = excluded.lastActiveAt, lastActiveMs = excluded.lastActiveMs,
      closedAt = excluded.closedAt
    WHERE excluded.lastActiveMs >= conversations.lastActiveMs
  `);
  const recent = db.query(`
    SELECT profile, sessionId, project, cwd, title, sessionFile, openedAt, lastActiveAt, closedAt
    FROM conversations WHERE lastActiveMs >= ? AND lastActiveMs <= ?
    ORDER BY lastActiveMs DESC, profile, sessionId
  `);
  return {
    upsert(input) {
      const row = ConversationSchema.parse(input);
      upsert.run(row.profile, row.sessionId, row.project, row.cwd, row.title.trim() || row.sessionId,
        row.sessionFile, new Date(row.openedAt).toISOString(), new Date(row.lastActiveAt).toISOString(),
        Date.parse(row.lastActiveAt), row.closedAt ? new Date(row.closedAt).toISOString() : null);
    },
    listRecent(now) {
      const end = now.getTime();
      if (!Number.isFinite(end)) throw new Error('A valid history query time is required');
      const start = end - 7 * 24 * 60 * 60 * 1000;
      return recent.all(start, end).map(value => {
        const row = ConversationSchema.parse(value);
        const availability = row.sessionFile === null ? 'ephemeral' : existsSync(row.sessionFile) ? 'saved' : 'missing';
        return { ...row, availability };
      });
    },
    close() { db.close(); },
  };
}

export interface SessionRoot { profile: string; path: string }
const SessionHeaderSchema = z.object({
  type: z.literal('session'), id: Identifier, cwd: Identifier,
  timestamp: Timestamp, title: z.string().optional(), continuationOf: Identifier.optional(),
});
const TitleEntrySchema = z.object({ type: z.literal('title_change'), title: z.string() });

/** Reads metadata only; oversized message lines are discarded while streaming. */
export async function importSessionMetadata(roots: SessionRoot[], store: HistoryStore): Promise<void> {
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    const files: string[] = [];
    for (const entry of await readdir(root.path, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(join(root.path, entry.name));
      if (!entry.isDirectory()) continue;
      // Default session layout is root/project/*.jsonl. Deeper folders are child transcripts.
      for (const child of await readdir(join(root.path, entry.name), { withFileTypes: true })) {
        if (child.isFile() && child.name.endsWith('.jsonl')) files.push(join(root.path, entry.name, child.name));
      }
    }
    for (const file of files) {
      let header: z.infer<typeof SessionHeaderSchema> | undefined;
      let title: string | undefined;
      let line = '';
      let discarded = false;
      const inspectLine = (text: string) => {
        if (!/"type"\s*:\s*"(session|title_change)"/.test(text)) return;
        let value: unknown;
        try { value = JSON.parse(text); } catch { return; }
        const session = SessionHeaderSchema.safeParse(value);
        if (session.success) {
          header = session.data;
          title = session.data.title;
          return;
        }
        const changed = TitleEntrySchema.safeParse(value);
        if (changed.success) title = changed.data.title;
      };
      for await (const chunk of createReadStream(file, { encoding: 'utf8', highWaterMark: 65536 })) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        let start = 0;
        while (start < text.length) {
          const newline = text.indexOf('\n', start);
          const part = text.slice(start, newline < 0 ? text.length : newline);
          if (!discarded) {
            if (line.length + part.length > 65536) { line = ''; discarded = true; }
            else line += part;
          }
          if (newline < 0) break;
          if (!discarded) inspectLine(line);
          line = '';
          discarded = false;
          start = newline + 1;
        }
      }
      if (line && !discarded) inspectLine(line);
      if (!header) throw new Error(`No valid session metadata: ${file}`);
      const modified = (await stat(file)).mtime.toISOString();
      store.upsert({
        profile: root.profile,
        sessionId: header.continuationOf ?? header.id,
        project: win32.basename(header.cwd.replace(/[\\/]+$/, '')) || header.cwd,
        cwd: header.cwd,
        title: title ?? header.id,
        sessionFile: file,
        openedAt: header.timestamp,
        lastActiveAt: modified,
        closedAt: null,
      });
    }
  }
}
