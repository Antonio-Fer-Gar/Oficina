import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { ConversationSchema } from '../conversation.ts';
import { importSessionMetadata, openHistory } from '../history.ts';
import { dispatchToBridge, inspectBridges } from './pipe.ts';
import { OfficeCommandSchema, type AgentInfo } from './protocol.ts';
import { findLegacyConsoles } from './legacy.ts';

// Stdio contract with the Electron main process; only this helper loads Bun SQLite and bridge tokens.
export const WorkerRequestSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('command'), command: OfficeCommandSchema }),
  z.object({ id: z.string(), type: z.literal('history') }),
  z.object({ id: z.string(), type: z.literal('briefed'), briefingId: z.string() }),
]);
const dataDir = process.env.NTER_OFFICE_DATA ?? join(process.env.LOCALAPPDATA ?? homedir(), 'nter-omp-office');
const ompRoot = join(homedir(), '.omp');
async function sessionRoots() {
  if (process.env.NTER_OFFICE_SESSION_ROOTS) return process.env.NTER_OFFICE_SESSION_ROOTS.split(';').filter(Boolean).map(path => ({ profile: 'default', path }));
  const roots = [{ profile: 'default', path: join(ompRoot, 'agent', 'sessions') }];
  const profiles = await readdir(join(ompRoot, 'profiles'), { withFileTypes: true }).catch(() => []);
  for (const entry of profiles) if (entry.isDirectory()) roots.push({ profile: entry.name, path: join(ompRoot, 'profiles', entry.name, 'agent', 'sessions') });
  return roots;
}
const store = openHistory(join(dataDir, 'history.sqlite'));
const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');

async function ingestPublished() {
  const directory = join(dataDir, 'conversations');
  let names: string[];
  try { names = await readdir(directory); } catch { return; }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try { store.upsert(ConversationSchema.parse(JSON.parse(await readFile(join(directory, name), 'utf8')))); }
    catch (error) { send({ type: 'warning', message: name + ': ' + (error instanceof Error ? error.message : 'invalid') }); }
  }
}
let polling = false;
// Consoles opened before the bridge; rescanned slowly because reading process parameters costs a PowerShell run.
let legacy: AgentInfo[] | null = null, scanning = false;
async function scanLegacy(connected: Set<number>) {
  if (scanning) return;
  scanning = true;
  try { legacy = await findLegacyConsoles(connected); }
  catch (error) { send({ type: 'warning', message: 'legacy scan: ' + (error instanceof Error ? error.message : String(error)) }); legacy ??= []; }
  finally { scanning = false; }
}
let lastScan = 0;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const inventory = await inspectBridges(join(dataDir, 'registry'));
    for (const agent of inventory.agents) if (agent.conversation) store.upsert(agent.conversation);
    const connected = new Set(inventory.agents.flatMap(agent => agent.terminal ? [agent.terminal.pid] : []));
    if (Date.now() - lastScan > 10000) { lastScan = Date.now(); void scanLegacy(connected); }
    // Filter again on every poll: a console that registers after the scan must not appear twice.
    const agents = [...inventory.agents, ...(legacy ?? []).filter(agent => !connected.has(Number(agent.ref.agentId.slice(8))))];
    // Until the first scan finishes the console count is not trustworthy for the messenger.
    const complete = inventory.complete && legacy !== null;
    send({ type: 'agents', agents, complete });
    const briefing = store.reconcileConsoles({ complete, consoles: agents.map(agent => ({
      instanceId: agent.ref.instanceId, generation: agent.ref.generation, sessionId: agent.ref.sessionId,
      kind: agent.parent ? 'subagent' : 'main' })) });
    if (briefing) send({ type: 'briefing', briefing });
  } catch (error) { send({ type: 'warning', message: error instanceof Error ? error.message : 'inventory failed' }); }
  finally { polling = false; }
}

createInterface({ input: process.stdin }).on('line', async line => {
  let id = '';
  try {
    const request = WorkerRequestSchema.parse(JSON.parse(line));
    id = request.id;
    if (request.type === 'command') send({ type: 'reply', id, result: await dispatchToBridge(join(dataDir, 'registry'), request.command) });
    else if (request.type === 'history') send({ type: 'reply', id, result: store.listRecent(new Date()) });
    else send({ type: 'reply', id, result: store.markBriefed(request.briefingId) });
  } catch (error) { send({ type: 'reply', id, error: error instanceof Error ? error.message : 'invalid request' }); }
}).on('close', () => { store.close(); process.exit(0); });

await importSessionMetadata(await sessionRoots(), store).catch(error => send({ type: 'warning', message: 'import: ' + String(error) }));
await ingestPublished();
send({ type: 'ready' });
await poll();
setInterval(() => { void poll(); }, 1000);
setInterval(() => { void ingestPublished(); }, 15000);
