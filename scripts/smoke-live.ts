import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

if (!process.argv.includes('--allow-model-turn')) throw new Error('Explicit --allow-model-turn consent is required');
const root = mkdtempSync(join(tmpdir(), 'nter-live-probe-'));
const observations = join(root, 'observations.jsonl');
const extension = join(root, 'probe.ts');
writeFileSync(extension, `
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import { appendFileSync } from 'node:fs';
const report = (value: unknown) => appendFileSync(process.env.NTER_PROBE_EVENTS!, JSON.stringify(value) + '\\n');
export default function probe(pi: ExtensionAPI) {
  pi.on('session_start', (_event, ctx) => {
    report({type:'session',identity:ctx.agent,sessionId:ctx.sessionManager.getSessionId()});
  });
  pi.registerCommand('office-root-name', {
    handler: async (_args, ctx) => {
      pi.setSessionName('NTER root probe');
      report({type:'root-name',name:pi.getSessionName(),identity:ctx.agent});
    }
  });
  pi.on('agent_end', (_event, ctx) => {
    report({type:'ended',identity:ctx.agent,name:pi.getSessionName(),pending:ctx.hasPendingMessages()});
  });
  pi.registerTool({
    name:'office_probe_ready', label:'Office integration probe',
    description:'For the temporary office integration check only: prove that this is the child session.',
    parameters:pi.zod.object({}), approval:'read', loadMode:'essential',
    async execute(_callId,_params,_signal,_update,ctx) {
      const accepted=ctx.model ? await pi.setModel(ctx.model) : false;
      pi.setSessionName('NTER child '+ctx.agent.id);
      report({type:'child-action',identity:ctx.agent,sessionId:ctx.sessionManager.getSessionId(),
        name:pi.getSessionName(),sameModelAccepted:accepted,
        model:ctx.model ? {provider:ctx.model.provider,id:ctx.model.id}:null});
      return {content:[{type:'text',text:'CHILD_PROBE_OK'}]};
    }
  });
}
`);
const OmpFrame = z.object({
  type: z.string(), id: z.string().optional(), command: z.string().optional(),
  success: z.boolean().optional(), isTerminal: z.boolean().optional(),
  error: z.string().optional(),
});
const Observation = z.object({
  type: z.string(), name: z.string().optional(), sameModelAccepted: z.boolean().optional(),
  sessionId: z.string().optional(),
  identity: z.object({ id: z.string(), kind: z.string(), parentId: z.string().nullable().optional() }),
});
const ompPath = join(process.env.LOCALAPPDATA ?? '', 'omp', 'omp.exe');
const child = spawn(ompPath, [
  '--mode', 'rpc-ui', '--session-dir', join(root, 'sessions'), '--no-extensions', '--extension', extension,
  '--tools', 'task,office_probe_ready', '--max-time', '120', '--max-cost', '1',
], { cwd: root, env: { ...process.env, NTER_PROBE_EVENTS: observations }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const finished = Promise.withResolvers<number | null>();
let stderr = '', buffer = '', agentStarted = false, promptSent = false, timedOut = false;
const timeline: Array<{ type: string; id?: string; command?: string; success?: boolean }> = [];
const send = (frame: unknown) => child.stdin.write(JSON.stringify(frame) + '\n');
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 150000);
child.on('error', finished.reject);
child.stderr.on('data', bytes => { stderr += bytes.toString(); });
child.stdout.on('data', bytes => {
  buffer += bytes.toString();
  let end: number;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    const result = OmpFrame.safeParse(value);
    if (!result.success) continue;
    const frame = result.data;
    timeline.push({ type: frame.type, id: frame.id, command: frame.command, success: frame.success });
    if (frame.type === 'ready') send({ id: 'name', type: 'prompt', message: '/office-root-name' });
    if (!promptSent && ((frame.type === 'response' && frame.id === 'name') || frame.type === 'prompt_result')) {
      promptSent = true;
      send({ id: 'live', type: 'prompt', message: 'This is an explicitly authorized disposable integration test. Do not read or edit files. Create exactly ONE subagent with task. This task exists only to test real subagent extension binding, so delegation is the requirement. Give it this exact task: Call office_probe_ready once with empty arguments, then reply only CHILD_PROBE_OK. Do not create further agents. After the task finishes, reply only ROOT_PROBE_OK. No other tools or work.' });
    }
    if (frame.type === 'agent_start') agentStarted = true;
    if (agentStarted && frame.type === 'agent_end' && frame.isTerminal !== false) child.stdin.end();
    if (frame.type === 'response' && frame.success === false) console.log(JSON.stringify({ responseError: frame.error, command: frame.command }));
  }
});
child.on('close', finished.resolve);
try {
  const exitCode = await finished.promise;
  const rows = existsSync(observations)
    ? readFileSync(observations, 'utf8').split('\n').filter(Boolean).map(line => Observation.parse(JSON.parse(line)))
    : [];
  const childAction = rows.find(row => row.type === 'child-action' && row.identity.kind !== 'main');
  const rootEnd = rows.findLast(row => row.type === 'ended' && row.identity.kind === 'main');
  const checks = {
    processExitedCleanly: exitCode === 0 && !timedOut,
    modelTurnObserved: agentStarted,
    realChildBound: !!childAction?.identity.parentId,
    childPublicModelAction: childAction?.sameModelAccepted === true,
    childTitleAction: childAction?.name === 'NTER child ' + childAction?.identity.id,
    parentNotRenamed: rootEnd?.name === 'NTER root probe',
  };
  console.log(JSON.stringify({checks,observations:rows,timeline,stderr,timedOut},null,2));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 2;
} finally {
  clearTimeout(timer);
  if (child.exitCode === null) child.kill();
  try { rmSync(root, { recursive: true, force: true }); }
  catch (error) { console.error('Probe temporary directory retained for inspection:', root, String(error)); }
}
