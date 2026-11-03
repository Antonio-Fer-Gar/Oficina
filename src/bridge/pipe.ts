import type { Socket } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AgentInfoSchema, BridgeRequestSchema, BridgeResponseSchema, DescriptorSchema,
  type AgentInfo, type BridgeResponse, type CommandResult, type Descriptor, type OfficeCommand,
} from './protocol.ts';

export interface BridgeHost {
  descriptor: Descriptor;
  close(): Promise<void>;
}
export interface BridgeServerOptions {
  registryDir: string;
  instanceId: string;
  generation: string;
  agents(): AgentInfo[];
  dispatch(command: OfficeCommand): Promise<CommandResult>;
}
export async function createBridgeServer(options: BridgeServerOptions): Promise<BridgeHost> {
  await mkdir(options.registryDir, { recursive: true, mode: 0o700 });
  const suffix = randomBytes(16).toString('hex');
  const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\nter-office-${suffix}` : join(options.registryDir, `${suffix}.sock`);
  const descriptor: Descriptor = {
    version: 1, instanceId: options.instanceId, generation: options.generation,
    pid: process.pid, pipe, token: randomBytes(32).toString('hex'), startedAt: new Date().toISOString(),
  };
  const file = join(options.registryDir, `${suffix}.json`);
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => socket.destroy());
    let input = '', handling = false;
    socket.on('error', () => { socket.destroy(); });
    socket.on('data', async chunk => {
      if (handling) return;
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > 1048576) {
        handling = true;
        socket.end(JSON.stringify({ type: 'error', code: 'oversized', message: 'Frame too large' }) + '\n');
        return;
      }
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      handling = true;
      const reply = (value: BridgeResponse) => socket.end(JSON.stringify(value) + '\n');
      try {
        const request = BridgeRequestSchema.safeParse(JSON.parse(input.slice(0, newline)));
        if (!request.success) { reply({ type: 'error', code: 'invalid', message: 'Invalid request' }); return; }
        const supplied = Buffer.from(request.data.token);
        const expected = Buffer.from(descriptor.token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
          reply({ type: 'error', code: 'unauthorized', message: 'Unauthorized' }); return;
        }
        const agents = options.agents().map(agent => AgentInfoSchema.parse(agent));
        if (request.data.type === 'snapshot') { reply({ type: 'snapshot', agents }); return; }
        const command = request.data.command;
        const target = agents.find(agent => agent.ref.instanceId === command.ref.instanceId &&
          agent.ref.generation === command.ref.generation && agent.ref.sessionId === command.ref.sessionId &&
          agent.ref.agentId === command.ref.agentId);
        if (!target) { reply({ type: 'result', result: { id: command.id, ok: false, code: 'stale', message: 'La sesión o el agente ya no están activos' } }); return; }
        reply({ type: 'result', result: await options.dispatch(command) });
      } catch {
        reply({ type: 'error', code: 'invalid', message: 'Request could not be applied' });
      }
    });
  });
  const listening = Promise.withResolvers<void>();
  server.once('error', listening.reject);
  server.listen(pipe, listening.resolve);
  await listening.promise;
  await writeFile(file, JSON.stringify(descriptor), { mode: 0o600, flag: 'wx' });
  return {
    descriptor,
    async close() {
      for (const socket of sockets) socket.destroy();
      const stopped = Promise.withResolvers<void>();
      server.close(() => stopped.resolve());
      await stopped.promise;
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    },
  };
}

export async function requestBridge(descriptor: Descriptor, request: { type: 'snapshot' } | { type: 'command'; command: OfficeCommand }): Promise<BridgeResponse> {
  const completed = Promise.withResolvers<BridgeResponse>();
  const socket = createConnection(descriptor.pipe);
  let input = '';
  socket.setEncoding('utf8');
  socket.setTimeout(5000, () => { socket.destroy(new Error('Bridge response timed out')); });
  socket.once('error', completed.reject);
  socket.once('connect', () => socket.write(JSON.stringify({ version: 1, token: descriptor.token, ...request }) + '\n'));
  socket.on('data', chunk => {
    input += chunk;
    if (Buffer.byteLength(input, 'utf8') > 1048576) { socket.destroy(new Error('Bridge response too large')); return; }
    const newline = input.indexOf('\n');
    if (newline < 0) return;
    try { completed.resolve(BridgeResponseSchema.parse(JSON.parse(input.slice(0, newline)))); }
    catch (error) { completed.reject(error); }
    socket.end();
  });
  socket.once('end', () => { if (!input.includes('\n')) completed.reject(new Error('Bridge closed before a response')); });
  try { return await completed.promise; } finally { socket.destroy(); }
}

export interface BridgeInventory { agents: AgentInfo[]; complete: boolean; errors: string[] }
export async function inspectBridges(registryDir: string): Promise<BridgeInventory> {
  await mkdir(registryDir, { recursive: true, mode: 0o700 });
  const agents: AgentInfo[] = [], errors: string[] = [];
  for (const entry of await readdir(registryDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const descriptor = DescriptorSchema.parse(JSON.parse(await readFile(join(registryDir, entry.name), 'utf8')));
      try { process.kill(descriptor.pid, 0); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') continue;
        throw error;
      }
      const response = await requestBridge(descriptor, { type: 'snapshot' });
      if (response.type !== 'snapshot') throw new Error('Host refused inventory');
      agents.push(...response.agents);
    } catch (error) { errors.push(`${entry.name}: ${error instanceof Error ? error.message : 'unavailable'}`); }
  }
  return { agents, complete: errors.length === 0, errors };
}

export async function dispatchToBridge(registryDir: string, command: OfficeCommand): Promise<CommandResult> {
  for (const entry of await readdir(registryDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const descriptor = DescriptorSchema.parse(JSON.parse(await readFile(join(registryDir, entry.name), 'utf8')));
    if (descriptor.instanceId !== command.ref.instanceId || descriptor.generation !== command.ref.generation) continue;
    const response = await requestBridge(descriptor, { type: 'command', command });
    if (response.type === 'result') return response.result;
    return { id: command.id, ok: false, code: 'invalid', message: response.type === 'error' ? response.message : 'Unexpected host response' };
  }
  return { id: command.id, ok: false, code: 'offline', message: 'La sesión original no está conectada' };
}
