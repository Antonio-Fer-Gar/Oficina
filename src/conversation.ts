import { z } from 'zod';
const Identifier = z.string().min(1).max(4096).refine(value => !value.includes('\0'));
const Timestamp = z.iso.datetime({ offset: true });
export const ConversationSchema = z.object({
  profile: Identifier, sessionId: Identifier, project: z.string().min(1).max(4096),
  cwd: Identifier, title: z.string().max(16384), sessionFile: Identifier.nullable(),
  openedAt: Timestamp, lastActiveAt: Timestamp, closedAt: Timestamp.nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationRecord = Conversation & { availability: 'saved' | 'missing' | 'ephemeral' };
