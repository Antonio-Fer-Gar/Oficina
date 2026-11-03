import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

type Check = { name: string; passed: boolean; evidence: string };
type SmokeOptions = { ompPath: string; allowModelTurn: boolean };
const ProbeFrame = z.object({
  type: z.string(), id: z.string().optional(), method: z.string().optional(),
  success: z.boolean().optional(), agentInvoked: z.boolean().optional(),
  data: z.object({
    commands: z.array(z.object({ name: z.string() })).optional(),
    agentInvoked: z.boolean().optional(),
  }).optional(),
});
const Observation = z.object({
  type: z.enum(['root', 'same-model', 'ui-answer']),
  identity: z.object({ id: z.string(), kind: z.string(), parentId: z.string().nullable().optional() }).optional(),
  cwd: z.string().optional(), hasUI: z.boolean().optional(),
  model: z.object({ provider: z.string(), id: z.string() }).nullable().optional(),
  accepted: z.boolean().optional(), answer: z.string().optional(),
  sessionId: z.string().optional(), sessionFile: z.string().nullable().optional(),
  sessionName: z.string().nullable().optional(),
});

/** Owns only an ephemeral process; never sends an agent/model prompt. */
export async function runBridgeSmoke(options: SmokeOptions): Promise<{ passed: boolean; checks: Check[] }> {
  if (options.allowModelTurn) throw new Error('This probe supports --no-model only; paid/live task checks require separate consent.');
  if (!existsSync(options.ompPath)) throw new Error(`omp executable not found: ${options.ompPath}`);
  const directory = mkdtempSync(join(tmpdir(), 'nter-omp-probe-'));
  const eventsFile = join(directory, 'observations.jsonl');
  const extensionFile = join(directory, 'office-probe.ts');
  // This is deliberately disposable investigation code, not the installed bridge.
  writeFileSync(extensionFile, `
import { appendFileSync } from 'node:fs';
const emit = (value) => appendFileSync(process.env.NTER_PROBE_EVENTS, JSON.stringify(value) + '\\n');
export default function officeProbe(pi) {
  pi.on('session_start', async (_event, ctx) => {
    pi.appendEntry('office-probe', { purpose: 'isolated no-model persistence check' });
    emit({ type: 'root', identity: ctx.agent, cwd: ctx.cwd,
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : null,
      hasUI: ctx.hasUI, sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? null,
      sessionName: pi.getSessionName() ?? null });
    if (ctx.model) {
      const accepted = await pi.setModel(ctx.model);
      emit({ type: 'same-model', accepted });
    }
  });
  pi.registerCommand('office-probe', {
    description: 'Disposable local UI probe: no model turn or tool execution',
    handler: async (_args, ctx) => {
      const answer = await ctx.ui.select('Office probe: no command will run', ['Close this isolated probe']);
      emit({ type: 'ui-answer', answer });
    },
  });
}
`, 'utf8');
  const frames: Array<z.infer<typeof ProbeFrame>> = [];
  let stderr = '';
  let buffer = '';
  let sentProbe = false;
  let dialogSeen = false;
  let finished = false;
  let timeout: NodeJS.Timeout | undefined;
  const child = spawn(options.ompPath, [
    '--mode', 'rpc-ui', '--session-dir', join(directory, 'sessions'), '--no-extensions', '--extension', extensionFile,
  ], {
    cwd: directory,
    env: { ...process.env, NTER_PROBE_EVENTS: eventsFile },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const send = (frame: unknown) => child.stdin.write(JSON.stringify(frame) + '\n');
  try {
    const { promise: exited, resolve: fulfill, reject } = Promise.withResolvers<number | null>();
      timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Isolated omp probe timed out; stderr: ${stderr.slice(0, 600)}`));
      }, 30_000);
      child.on('error', reject);
      child.stderr.on('data', bytes => { stderr += bytes.toString(); });
      child.stdout.on('data', bytes => {
        buffer += bytes.toString();
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          let parsed: unknown;
          try { parsed = JSON.parse(line); } catch { continue; }
          const validated = ProbeFrame.safeParse(parsed);
          if (!validated.success) continue;
          const frame = validated.data;
          const data = frame.data;
          frames.push(frame);
          if (frame.type === 'ready') {
            send({ id: 'state', type: 'get_state' });
            send({ id: 'children', type: 'get_subagents' });
            send({ id: 'commands', type: 'get_available_commands' });
          }
          if (frame.type === 'response' && frame.id === 'commands') {
            const commands = data?.commands;
            if (!frame.success || !commands?.some(command => command.name === 'office-probe')) {
              finished = true;
              child.stdin.end();
              continue;
            }
            // The command is confirmed registered before this local slash dispatch.
            sentProbe = true;
            send({ id: 'probe', type: 'prompt', message: '/office-probe' });
          }
          if (frame.type === 'extension_ui_request' && frame.method === 'select') {
            dialogSeen = true;
            send({ type: 'extension_ui_response', id: frame.id, value: 'Close this isolated probe' });
          }
          if (sentProbe && (
            (frame.type === 'prompt_result' && frame.id === 'probe' && frame.agentInvoked === false) ||
            (frame.type === 'response' && frame.id === 'probe' && data?.agentInvoked === false)
          )) {
            finished = true;
            child.stdin.end();
          }
        }
      });
      child.on('exit', code => fulfill(code));
    const exitCode = await exited;
    const observations = existsSync(eventsFile)
      ? readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).map(line => Observation.parse(JSON.parse(line)))
      : [];
    const root = observations.find(event => event.type === 'root');
    const model = observations.find(event => event.type === 'same-model');
    const ui = observations.find(event => event.type === 'ui-answer');
    const state = frames.find(frame => frame.type === 'response' && frame.id === 'state');
    const children = frames.find(frame => frame.type === 'response' && frame.id === 'children');
    const modelWasInvoked = frames.some(frame => frame.type === 'agent_start');
    const checks: Check[] = [
      { name: 'owned-process-clean-exit', passed: exitCode === 0 && finished, evidence: `exit=${exitCode}; localCommandFinished=${finished}; stderrBytes=${stderr.length}` },
      { name: 'explicit-extension-root-identity', passed: !!root?.identity?.id && !!root?.cwd, evidence: JSON.stringify(root ?? { observed: false }) },
      { name: 'same-model-public-action', passed: model?.accepted === true, evidence: JSON.stringify(model ?? { observed: false }) },
      { name: 'rpc-state-and-subagents', passed: state?.success === true && children?.success === true, evidence: `get_state=${state?.success}; get_subagents=${children?.success}` },
      { name: 'real-extension-select-roundtrip', passed: dialogSeen && ui?.answer === 'Close this isolated probe', evidence: JSON.stringify({ dialogSeen, answer: ui?.answer ?? null }) },
      { name: 'no-model-turn', passed: !modelWasInvoked, evidence: `agent_start observed=${modelWasInvoked}` },
      { name: 'own-conversation-file-persisted', passed: typeof root?.sessionFile === 'string' && existsSync(root.sessionFile), evidence: JSON.stringify({ sessionId: root?.sessionId ?? null, sessionFile: root?.sessionFile ?? null }) },
      { name: 'exact-original-terminal-focus', passed: false, evidence: 'NOT RUN: needs two owned visible terminals and verified pane selection; inherited WT_SESSION alone is not proof.' },
      { name: 'child-targeted-actions', passed: false, evidence: 'NOT RUN: a real task requires specific model-turn consent. Decisions now stay in the original terminal, not Collab.' },
    ];
    return { passed: checks.every(check => check.passed), checks };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) {
      child.stdin.end();
      child.kill();
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const configured = process.argv.indexOf('--omp');
  const ompPath = configured >= 0
    ? resolve(process.argv[configured + 1])
    : join(process.env.LOCALAPPDATA ?? '', 'omp', 'omp.exe');
  try {
    const result = await runBridgeSmoke({ ompPath, allowModelTurn: false });
    for (const check of result.checks) console.log(JSON.stringify(check));
    console.log(JSON.stringify({ status: result.passed ? 'PASS' : 'INCOMPLETE', modelTurnsRequested: 0 }));
    process.exitCode = result.passed ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
