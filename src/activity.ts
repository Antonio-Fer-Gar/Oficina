import { z } from 'zod';
import type { AgentInfo } from './bridge/protocol.ts';

export const ActivityKindSchema = z.enum(['none', 'thinking', 'reading', 'searching', 'writing', 'executing', 'coordinating']);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export const RecentActivitySchema = z.object({ kind: ActivityKindSchema, endedAt: z.number().int().nonnegative() });
export type RecentActivity = z.infer<typeof RecentActivitySchema>;

/** How long a finished action may stay drawn: snapshots arrive about once a second, so quick tools would never show. */
const RECENT_MS = 1500;
const KINDS: Record<string, ActivityKind> = {
  read: 'reading',
  web_search: 'searching', browser: 'searching', search: 'searching',
  glob: 'searching', grep: 'searching', find: 'searching', ast_grep: 'searching',
  write: 'writing', edit: 'writing', ast_edit: 'writing',
  bash: 'executing', eval: 'executing', debug: 'executing',
  task: 'coordinating',
};
const PathArgs = z.object({ path: z.string() });
/** An action with its own prop, as opposed to no tool or an unrecognized one. */
const isAction = (kind: ActivityKind) => kind !== 'none' && kind !== 'thinking';

/** The action a tool call performs, from its real name and arguments only; unrecognized tools are plain thinking. */
export function classifyTool(toolName: string, args: unknown): ActivityKind {
  // Namespaced names such as `mcp__server__tool`, `functions.tool` or `server:tool` classify by the tool.
  const name = toolName.toLowerCase().split(/__|[.:/]/).pop() ?? '';
  const path = PathArgs.safeParse(args).data?.path ?? '';
  if (name === 'read' && /^https?:\/\//i.test(path)) return 'searching';
  if (name === 'write' && path.startsWith('agent://')) return 'coordinating';
  // `write xd://<tool>` runs a tool device such as ast_edit or debug.
  if (name === 'write' && path.startsWith('xd://')) return classifyTool(path.slice('xd://'.length).split(/[/?#]/)[0], undefined);
  if (Object.hasOwn(KINDS, name)) return KINDS[name];
  return name.includes('search') ? 'searching' : 'thinking';
}

interface RunningTool { name: string; kind: ActivityKind }
/** Live tool calls of one agent run, keyed by toolCallId so parallel calls start and finish independently. Not persisted. */
export class ActivityTracker {
  readonly #running = new Map<string, RunningTool>();
  #recent: RecentActivity | undefined;
  start(toolCallId: string, toolName: string, args: unknown): void {
    this.#running.set(toolCallId, { name: toolName, kind: classifyTool(toolName, args) });
  }
  /** Ends one call; unknown or already finished ids change nothing. */
  end(toolCallId: string, now = Date.now()): void {
    const tool = this.#running.get(toolCallId);
    if (!tool) return;
    this.#running.delete(toolCallId);
    if (isAction(tool.kind)) this.#recent = { kind: tool.kind, endedAt: now };
  }
  /** A new run starts clean: nothing from earlier tools stays visible. */
  clear(): void {
    this.#running.clear();
    this.#recent = undefined;
  }
  /** Activity fields of AgentInfo now: the newest running action wins; an idle agent runs no tool. */
  publish(idle: boolean): Pick<AgentInfo, 'activity' | 'activityKind' | 'recentActivity'> {
    if (idle) return { activity: '', activityKind: 'none', recentActivity: this.#recent };
    const running = [...this.#running.values()];
    const tool = running.findLast(item => isAction(item.kind)) ?? running.at(-1);
    return { activity: tool?.name ?? 'Trabajando', activityKind: tool?.kind ?? 'thinking', recentActivity: this.#recent };
  }
}

/**
 * What the office draws now. Only a working agent shows an action, and bridges that predate
 * `activityKind` show none rather than a guess from the activity text. While no action runs, the
 * latest finished one stays for up to 1.5 s as a completion animation, never past the working phase.
 */
export function resolveActivity(info: Pick<AgentInfo, 'phase' | 'activityKind' | 'recentActivity'>, now = Date.now()): ActivityKind {
  if (info.phase !== 'working' || !info.activityKind) return 'none';
  if (isAction(info.activityKind)) return info.activityKind;
  const recent = info.recentActivity;
  const age = recent ? now - recent.endedAt : -1;
  return recent && isAction(recent.kind) && age >= 0 && age <= RECENT_MS ? recent.kind : info.activityKind;
}
