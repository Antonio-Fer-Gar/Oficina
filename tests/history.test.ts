import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importSessionMetadata, openHistory, type ConsoleIdentity } from '../src/history.ts';
import type { Conversation } from '../src/conversation.ts';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function databasePath() {
  const dir = mkdtempSync(join(tmpdir(), 'nter-history-test-'));
  directories.push(dir);
  return join(dir, 'history.sqlite');
}
const now = new Date('2026-10-28T12:00:00.000Z');
function conversation(sessionId: string, lastActiveAt: string): Conversation {
  return { profile: 'default', sessionId, project: 'Project', cwd: 'C:\\Projects\\Project', title: sessionId,
    sessionFile: null, openedAt: '2026-10-01T10:00:00.000Z', lastActiveAt, closedAt: null };
}
function consoleRef(instanceId: string, kind: 'main' | 'subagent' = 'main'): ConsoleIdentity {
  return { instanceId, generation: 'generation-1', sessionId: 'session-' + instanceId, kind };
}

test('recent conversations include exactly seven rolling days, newest first, not calendar weeks', () => {
  const history = openHistory(databasePath());
  try {
    history.upsert(conversation('recent', '2026-10-28T11:00:00.000Z'));
    history.upsert(conversation('last-week', '2026-10-23T09:00:00.000Z'));
    history.upsert(conversation('boundary', '2026-10-21T12:00:00.000Z'));
    history.upsert(conversation('expired', '2026-10-21T11:59:59.999Z'));
    history.upsert(conversation('future', '2026-10-28T12:00:00.001Z'));
    expect(history.listRecent(now).map(row => row.sessionId)).toEqual(['recent', 'last-week', 'boundary']);
  } finally { history.close(); }
});

test('reopening a catalog preserves metadata and updating the same conversation does not duplicate it', () => {
  const path = databasePath();
  const history = openHistory(path);
  history.upsert({ ...conversation('one', '2026-10-26T11:00:00.000Z'), title: 'Initial conversation' });
  history.close();
  const reopened = openHistory(path);
  try {
    reopened.upsert({ ...conversation('one', '2026-10-28T11:00:00.000Z'), title: 'Continued conversation', closedAt: '2026-10-28T11:00:00.000Z' });
    reopened.upsert({ ...conversation('one', '2026-10-25T11:00:00.000Z'), title: 'Stale import' });
    const rows = reopened.listRecent(now);
    expect(rows.map(row => [row.sessionId, row.title, row.cwd])).toEqual([['one', 'Continued conversation', 'C:\\Projects\\Project']]);
  } finally { reopened.close(); }
});

test('each confirmed zero-to-one console transition can trigger a visit even in the same day', () => {
  const history = openHistory(databasePath());
  const a = consoleRef('A'), b = consoleRef('B'), c = consoleRef('C');
  try {
    expect(history.reconcileConsoles({ complete: true, consoles: [] })).toBeNull();
    const first = history.reconcileConsoles({ complete: true, consoles: [a] });
    expect(first?.console.instanceId).toBe('A');
    expect(history.markBriefed(first!.id)).toBe(true);
    expect(history.reconcileConsoles({ complete: true, consoles: [a] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [a, b] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [b] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [] })).toBeNull();
    const second = history.reconcileConsoles({ complete: true, consoles: [c] });
    expect(second?.console.instanceId).toBe('C');
    expect(second?.id).not.toBe(first?.id);
    history.markBriefed(second!.id);
    expect(history.reconcileConsoles({ complete: true, consoles: [] })).toBeNull();
    // Two consoles registering within one inventory still end the zero-console state.
    expect(history.reconcileConsoles({ complete: true, consoles: [a, b] })).not.toBeNull();
  } finally { history.close(); }
});

test('subagents and incomplete inventories cannot rearm a visit or count as extra consoles', () => {
  const history = openHistory(databasePath());
  const a = consoleRef('A'), child = consoleRef('mouse', 'subagent');
  try {
    const first = history.reconcileConsoles({ complete: true, consoles: [a, child, a] });
    expect(first?.console.instanceId).toBe('A');
    history.markBriefed(first!.id);
    expect(history.reconcileConsoles({ complete: false, consoles: [] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [a, child] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [child] })).toBeNull();
    expect(history.reconcileConsoles({ complete: true, consoles: [a] })?.console.instanceId).toBe('A');
  } finally { history.close(); }
});

test('restarting the office with the same live console does not repeat a presented visit', () => {
  const path = databasePath(), a = consoleRef('A');
  const first = openHistory(path);
  const briefing = first.reconcileConsoles({ complete: true, consoles: [a] });
  first.markBriefed(briefing!.id);
  first.close();
  const second = openHistory(path);
  try {
    expect(second.reconcileConsoles({ complete: true, consoles: [a] })).toBeNull();
    expect(second.markBriefed('old-or-unrelated-request')).toBe(false);
  } finally { second.close(); }
});

test('a missing conversation file differs from an explicitly ephemeral session', () => {
  const history = openHistory(databasePath());
  const dir = directories.at(-1)!;
  const saved = join(dir, 'saved.jsonl');
  writeFileSync(saved, '{"type":"session","id":"saved"}\n');
  try {
    history.upsert({ ...conversation('saved', '2026-10-28T11:00:00.000Z'), sessionFile: saved, title: '' });
    history.upsert({ ...conversation('missing', '2026-10-28T10:00:00.000Z'), sessionFile: join(dir, 'missing.jsonl') });
    history.upsert(conversation('ephemeral', '2026-10-28T09:00:00.000Z'));
    expect(history.listRecent(now).map(row => [row.title, row.availability])).toEqual([
      ['saved', 'saved'], ['missing', 'missing'], ['ephemeral', 'ephemeral'],
    ]);
  } finally { history.close(); }
});

test('saved sessions import their final title without importing task-child transcripts or huge message bodies', async () => {
  const history = openHistory(databasePath());
  const root = join(directories.at(-1)!, 'sessions');
  const project = join(root, 'project');
  mkdirSync(join(project, 'child-transcripts'), { recursive: true });
  const file = join(project, 'main.jsonl');
  writeFileSync(file, [
    JSON.stringify({ type: 'session', id: 'existing', cwd: 'C:\\Projects\\Real', timestamp: '2026-10-22T10:00:00.000Z', title: 'Old title' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: 'private-data'.repeat(300000) } }),
    JSON.stringify({ type: 'title_change', title: 'Actual saved conversation' }),
    '',
  ].join('\n'));
  writeFileSync(join(project, 'child-transcripts', 'mouse.jsonl'), JSON.stringify({
    type: 'session', id: 'child', cwd: 'C:\\Projects\\Real', timestamp: '2026-10-22T10:00:00.000Z',
  }));
  const activity = new Date('2026-10-28T10:00:00.000Z');
  utimesSync(file, activity, activity);
  try {
    await importSessionMetadata([{ profile: 'default', path: root }], history);
    expect(history.listRecent(now).map(row => [row.sessionId, row.title, row.project, row.availability])).toEqual([
      ['existing', 'Actual saved conversation', 'Real', 'saved'],
    ]);
  } finally { history.close(); }
});
