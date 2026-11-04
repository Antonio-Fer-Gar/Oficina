import { z } from 'zod';
import { ConversationSchema } from '../conversation.ts';
import { ActivityDescriptionSchema, ActivityKindSchema, RecentActivitySchema } from '../activity.ts';

const Id = z.string().min(1).max(4096).refine(value => !value.includes('\0'));
export const AgentRefSchema = z.object({ instanceId: Id, generation: Id, sessionId: Id, agentId: Id });
export type AgentRef = z.infer<typeof AgentRefSchema>;
export const ThinkingSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export type Thinking = z.infer<typeof ThinkingSchema>;
/** `efforts` lists the reasoning levels this model accepts; empty means it has no adjustable reasoning. */
export const ModelRefSchema = z.object({ provider: Id, id: Id, name: z.string(), efforts: z.array(ThinkingSchema).optional() });
export type ModelRef = z.infer<typeof ModelRefSchema>;
export const TerminalTargetSchema = z.object({
  pid: z.number().int().positive(), startedAt: Id,
  kind: z.enum(['windows-terminal', 'classic']),
  windowHandle: z.string().optional(), wtSession: z.string().optional(), marker: Id,
});
export type TerminalTarget = z.infer<typeof TerminalTargetSchema>;
export const QuestionSchema = z.object({
  id: Id, question: z.string(), header: z.string().nullish(),
  options: z.array(z.object({ label: z.string(), description: z.string().nullish(), preview: z.string().nullish() })),
  multi: z.boolean().nullish(), recommended: z.number().int().nullish(),
});
export const PendingQuestionSchema = z.object({ requestId: Id, questions: z.array(QuestionSchema) });
export type PendingQuestion = z.infer<typeof PendingQuestionSchema>;
export const AnswerSchema = z.object({ id: Id, selectedOptions: z.array(z.string()), customInput: z.string().max(131072).optional() });
export type Answer = z.infer<typeof AnswerSchema>;
export const AgentInfoSchema = z.object({
  ref: AgentRefSchema, parent: AgentRefSchema.nullable(), name: Id, cwd: Id,
  model: ModelRefSchema.nullable(), thinking: ThinkingSchema.nullable(),
  phase: z.enum(['working', 'idle', 'asking-parent', 'waiting-human', 'stopped', 'unknown']),
  activity: z.string().max(16384), queued: z.number().int().nonnegative(),
  pendingAsync: z.boolean(), runningChildren: z.number().int().nonnegative(),
  terminal: TerminalTargetSchema.nullable(), conversation: ConversationSchema.nullable(),
  /** false for consoles opened before the bridge: visible in the office but not controllable. */
  connected: z.boolean().optional(),
  question: PendingQuestionSchema.nullable().optional(),
  /** Action of the live tools (see resolveActivity); missing from older bridges, which must show no action rather than a guess. */
  activityKind: ActivityKindSchema.optional(),
  /** Safe brief description for the active tool; omitted by older bridges. */
  activityDescription: ActivityDescriptionSchema.optional(),
  /** Count of live user-message events received for this agent identity since bridge startup. */
  receivedMessages: z.number().int().nonnegative().optional(),
  /** Unix timestamp in milliseconds of the latest live user-message event. */
  lastMessageAt: z.number().int().nonnegative().optional(),
  /** Latest finished tool with an action, for a brief completion animation; never a running tool. */
  recentActivity: RecentActivitySchema.optional(),
});
export type AgentInfo = z.infer<typeof AgentInfoSchema>;
export const OfficeCommandSchema = z.discriminatedUnion('type', [
  z.object({ id: Id, type: z.literal('message'), ref: AgentRefSchema, text: z.string().min(1).max(131072), delivery: z.enum(['steer', 'followUp']) }),
  z.object({ id: Id, type: z.literal('set-model'), ref: AgentRefSchema, model: ModelRefSchema, thinking: ThinkingSchema.nullable() }),
  z.object({ id: Id, type: z.literal('models'), ref: AgentRefSchema }),
  z.object({ id: Id, type: z.literal('answer'), ref: AgentRefSchema, requestId: Id, answers: z.array(AnswerSchema) }),
]);
export type OfficeCommand = z.infer<typeof OfficeCommandSchema>;
export const CommandResultSchema = z.discriminatedUnion('ok', [
  z.object({ id: Id, ok: z.literal(true), status: z.enum(['applied', 'queued']), models: z.array(ModelRefSchema).optional() }),
  z.object({ id: Id, ok: z.literal(false), code: z.enum(['stale', 'offline', 'invalid', 'unsupported']), message: z.string() }),
]);
export type CommandResult = z.infer<typeof CommandResultSchema>;
export const DescriptorSchema = z.object({
  version: z.literal(1), instanceId: Id, generation: Id, pid: z.number().int().positive(),
  pipe: Id, token: z.string().regex(/^[a-f0-9]{64}$/), startedAt: Id,
});
export type Descriptor = z.infer<typeof DescriptorSchema>;
export const BridgeRequestSchema = z.discriminatedUnion('type', [
  z.object({ version: z.literal(1), token: z.string(), type: z.literal('snapshot') }),
  z.object({ version: z.literal(1), token: z.string(), type: z.literal('command'), command: OfficeCommandSchema }),
]);
export const BridgeResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), agents: z.array(AgentInfoSchema) }),
  z.object({ type: z.literal('result'), result: CommandResultSchema }),
  z.object({ type: z.literal('error'), code: z.enum(['unauthorized', 'invalid', 'oversized']), message: z.string() }),
]);
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;
export type OfficeEvent =
  | { type: 'agent'; seq: number; agent: AgentInfo }
  | { type: 'removed'; seq: number; ref: AgentRef }
  | { type: 'disconnected'; seq: number; instanceId: string; generation: string }
  | { type: 'attention'; seq: number; ref: AgentRef; requestId: string; pending: boolean }
  | { type: 'consultation'; seq: number; child: AgentRef; parent: AgentRef; pending: boolean };
