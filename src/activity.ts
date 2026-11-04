import { z } from 'zod';
import type { AgentInfo } from './bridge/protocol.ts';

export const ActivityKindSchema = z.enum(['none', 'thinking', 'reading', 'searching', 'writing', 'executing', 'coordinating']);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;
export const ActivityDescriptionSchema = z.string().transform(value => value.length <= 120 && safeDescription(value) ? value : '');
export const RecentActivitySchema = z.object({
  kind: ActivityKindSchema, endedAt: z.number().int().nonnegative(), description: ActivityDescriptionSchema.optional(),
});
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
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const SENSITIVE_FILE_NAME = /(?:secret|credential|password|passwd|passphrase|token|api[-_.]?key|access[-_.]?key|private|clav(?:e|es)|llaves?|(?:^|[._-])(?:env|id[_-]?rsa|id[_-]?ed25519|ssh|auth|cookie|session|vault|wallet|keychain|key|keys|cert|certificate)(?:$|[._-]))/i;
const SENSITIVE_FILE_EXTENSION = /\.(?:pem|key|p12|pfx|crt|cer|der|jks|keystore|pub|p8|p7b|p7c|p7m|p7s|asc)$/i;
const SAFE_DESCRIPTIONS: Record<string, true> = {
  'Leo un archivo': true, 'Consulto la web': true, 'Busco en la web': true, 'Busco archivos': true, 'Busco referencias': true,
  'Escribo un archivo': true, 'Edito un archivo': true, 'Edito código': true, 'Depuro código': true, 'Ejecuto pruebas': true,
  'Ejecuto comando': true, 'Coordino subagentes': true,
};

function argsRecord(args: unknown): Record<string, unknown> | undefined {
  return args !== null && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : undefined;
}
function toolPath(args: unknown): string {
  const path = argsRecord(args)?.path;
  return typeof path === 'string' ? path : '';
}
function hasHighEntropyPart(value: string): boolean {
  return value.split(/[._-]/).some(part => {
    if (part.length < 16) return false;
    const counts = new Map<string, number>();
    for (const character of part) counts.set(character, (counts.get(character) ?? 0) + 1);
    let entropy = 0;
    for (const count of counts.values()) {
      const probability = count / part.length;
      entropy -= probability * Math.log2(probability);
    }
    return entropy >= 3.5;
  });
}
function safeFileName(path: string): string | undefined {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) return undefined;
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  if (!SAFE_FILE_NAME.test(name) || SENSITIVE_FILE_NAME.test(name) || SENSITIVE_FILE_EXTENSION.test(name) ||
    hasHighEntropyPart(name)) return undefined;
  return name;
}
function safeSkillName(name: string): string | undefined {
  return SAFE_SKILL_NAME.test(name) && !SENSITIVE_FILE_NAME.test(name) && !hasHighEntropyPart(name) ? name : undefined;
}
function skillNameFromPath(path: string): string | undefined {
  if (/^skill:\/\//i.test(path)) {
    const name = path.slice(path.indexOf('//') + 2).split(/[/?#\\]/, 1)[0] ?? '';
    return safeSkillName(name);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) return undefined;
  const parts = path.replace(/\\/g, '/').split(/[?#]/, 1)[0]!.split('/').filter(Boolean);
  if (parts.at(-1)?.toLowerCase() !== 'skill.md') return undefined;
  const directory = parts.at(-2), marker = parts.at(-3)?.toLowerCase();
  return directory && (marker === 'skill' || marker === 'skills') ? safeSkillName(directory) : undefined;
}
function safeDescription(value: string): boolean {
  if (Object.hasOwn(SAFE_DESCRIPTIONS, value)) return true;
  const skillPrefix = 'Consulto skill: ';
  if (value.startsWith(skillPrefix)) return safeSkillName(value.slice(skillPrefix.length)) !== undefined;
  for (const prefix of ['Leo ', 'Escribo ', 'Edito ']) {
    if (value.startsWith(prefix)) {
      const name = value.slice(prefix.length);
      return safeFileName(name) === name;
    }
  }
  return false;
}
function normalizedToolName(toolName: string): string {
  return toolName.toLowerCase().split(/__|[.:/]/).pop() ?? '';
}
function describedFileName(args: unknown): string | undefined {
  const path = toolPath(args);
  if (path) return safeFileName(path);
  const input = argsRecord(args)?.input;
  if (typeof input !== 'string') return undefined;
  const header = /^\[([^\]\r\n]+)#[0-9a-f]{4}\](?:\r?\n|$)/i.exec(input);
  return header ? safeFileName(header[1]!) : undefined;
}
function isTestCommand(args: unknown): boolean {
  const command = argsRecord(args)?.command;
  if (typeof command !== 'string' || command.length > 4096) return false;
  return /^\s*(?:(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|tests)(?:\s|$)|(?:pytest|jest)(?:\s|$)|(?:cargo|go)\s+test(?:\s|$)|node\s+--test(?:\s|$)|vitest\s+(?:run|watch)(?:\s|$))/i.test(command);
}
function describeTool(toolName: string, args: unknown, kind = classifyTool(toolName, args)): string {
  const name = normalizedToolName(toolName), path = toolPath(args);
  if (name === 'write' && path.startsWith('agent://')) return 'Coordino subagentes';
  if (name === 'write' && path.startsWith('xd://')) {
    return describeTool(path.slice('xd://'.length).split(/[/?#]/)[0] ?? '', undefined);
  }
  if (kind === 'thinking' || kind === 'none') return '';
  if (name === 'read') {
    if (/^https?:\/\//i.test(path)) return 'Consulto la web';
    const skill = skillNameFromPath(path);
    if (skill) return `Consulto skill: ${skill}`;
    const file = describedFileName(args);
    if (/^skill:\/\//i.test(path) || /(?:^|[/\\])skills?[/\\][^/\\]+[/\\]skill\.md$/i.test(path)) return 'Leo un archivo';
    return file ? `Leo ${file}` : 'Leo un archivo';
  }
  if (kind === 'searching') {
    if (name === 'web_search' || name === 'browser') return 'Busco en la web';
    return name === 'glob' || name === 'find' ? 'Busco archivos' : 'Busco referencias';
  }
  if (kind === 'writing') {
    if (name === 'write') {
      const file = safeFileName(path);
      return file ? `Escribo ${file}` : 'Escribo un archivo';
    }
    if (name === 'edit') {
      const file = describedFileName(args);
      return file ? `Edito ${file}` : 'Edito un archivo';
    }
    return 'Edito código';
  }
  if (kind === 'executing') {
    if (name === 'debug') return 'Depuro código';
    return isTestCommand(args) ? 'Ejecuto pruebas' : 'Ejecuto comando';
  }
  return kind === 'coordinating' ? 'Coordino subagentes' : '';
}

/** The action a tool call performs, from its real name and arguments only; unrecognized tools are plain thinking. */
export function classifyTool(toolName: string, args: unknown): ActivityKind {
  // Namespaced names such as `mcp__server__tool`, `functions.tool` or `server:tool` classify by the tool.
  const name = normalizedToolName(toolName);
  const path = PathArgs.safeParse(args).data?.path ?? '';
  if (name === 'read' && /^https?:\/\//i.test(path)) return 'searching';
  if (name === 'write' && path.startsWith('agent://')) return 'coordinating';
  // `write xd://<tool>` runs a tool device such as ast_edit or debug.
  if (name === 'write' && path.startsWith('xd://')) return classifyTool(path.slice('xd://'.length).split(/[/?#]/)[0], undefined);
  if (Object.hasOwn(KINDS, name)) return KINDS[name];
  return name.includes('search') ? 'searching' : 'thinking';
}

interface RunningTool { name: string; kind: ActivityKind; description: string }
/** Live tool calls of one agent run, keyed by toolCallId so parallel calls start and finish independently. Not persisted. */
export class ActivityTracker {
  readonly #running = new Map<string, RunningTool>();
  #recent: RecentActivity | undefined;
  start(toolCallId: string, toolName: string, args: unknown): void {
    const kind = classifyTool(toolName, args);
    this.#running.set(toolCallId, { name: toolName, kind, description: describeTool(toolName, args, kind) });
  }
  /** Ends one call; unknown or already finished ids change nothing. */
  end(toolCallId: string, now = Date.now()): void {
    const tool = this.#running.get(toolCallId);
    if (!tool) return;
    this.#running.delete(toolCallId);
    if (isAction(tool.kind)) this.#recent = { kind: tool.kind, endedAt: now, description: tool.description };
  }
  /** A new run starts clean: nothing from earlier tools stays visible. */
  clear(): void {
    this.#running.clear();
    this.#recent = undefined;
  }
  /** Activity fields of AgentInfo now: the newest running action wins; an idle agent runs no tool. */
  publish(idle: boolean): Pick<AgentInfo, 'activity' | 'activityKind' | 'activityDescription' | 'recentActivity'> {
    if (idle) return { activity: '', activityKind: 'none', activityDescription: '', recentActivity: this.#recent };
    const running = [...this.#running.values()];
    const tool = running.findLast(item => isAction(item.kind)) ?? running.at(-1);
    return {
      activity: tool?.name ?? 'Trabajando', activityKind: tool?.kind ?? 'thinking',
      activityDescription: tool?.description ?? '', recentActivity: this.#recent,
    };
  }
}

function visibleRecentActivity(recent: RecentActivity | undefined, now: number): RecentActivity | undefined {
  const age = recent ? now - recent.endedAt : -1;
  return recent && isAction(recent.kind) && age >= 0 && age <= RECENT_MS ? recent : undefined;
}
/**
 * What the office draws now. Only a working agent shows an action, and bridges that predate
 * `activityKind` show none rather than a guess from the activity text. While no action runs, the
 * latest finished one stays for up to 1.5 s as a completion animation, never past the working phase.
 */
export function resolveActivity(info: Pick<AgentInfo, 'phase' | 'activityKind' | 'recentActivity'>, now = Date.now()): ActivityKind {
  if (info.phase !== 'working' || !info.activityKind) return 'none';
  if (isAction(info.activityKind)) return info.activityKind;
  return visibleRecentActivity(info.recentActivity, now)?.kind ?? info.activityKind;
}
/** Matches resolveActivity's phase, live-action priority, and recent-action timeout. */
export function resolveActivityDescription(
  info: Pick<AgentInfo, 'phase' | 'activityKind' | 'activityDescription' | 'recentActivity'>,
  now = Date.now(),
): string {
  if (info.phase !== 'working' || !info.activityKind) return '';
  if (isAction(info.activityKind)) return info.activityDescription ?? '';
  return visibleRecentActivity(info.recentActivity, now)?.description ?? '';
}
