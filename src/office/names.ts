import { z } from 'zod';
import type { AgentInfo } from '../bridge/protocol.ts';
import type { Actor, Project } from '../state.ts';
import { catName } from './sprites.ts';

export const VisualNameSchema = z.string().trim().max(48).refine(name => !/[\x00-\x1f\x7f]/.test(name), 'Usa un nombre de una sola línea');
export const OfficeNamesSchema = z.object({
  cats: z.record(z.string(), VisualNameSchema),
  projects: z.record(z.string(), VisualNameSchema),
});
export type OfficeNames = z.infer<typeof OfficeNamesSchema>;
export const RenameSchema = z.object({ kind: z.enum(['cat', 'project']), key: z.string().min(1).max(4096), name: VisualNameSchema });
export type Rename = z.infer<typeof RenameSchema>;
export function catNameKey(info: AgentInfo): string {
  return JSON.stringify([info.conversation?.profile ?? 'default', info.conversation?.sessionId ?? info.ref.sessionId]);
}
export function projectNameKey(cwd: string): string {
  return cwd.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
export function actorName(actor: Actor, names: OfficeNames): string {
  return actor.info.parent ? actor.info.name : names.cats[catNameKey(actor.info)] || catName(actor.nameIndex);
}
/** Only one main agent can be the mole, even if several were renamed Pablo. */
export function moleActor(actors: Iterable<Actor>, names: OfficeNames): Actor | undefined {
  let mole: Actor | undefined;
  for (const actor of actors) {
    if (!actor.info.parent && actorName(actor, names).trim().toLowerCase() === 'pablo' &&
      (!mole || actor.order < mole.order)) mole = actor;
  }
  return mole;
}
export function projectName(project: Project, names: OfficeNames): string {
  return names.projects[project.id] || project.name;
}
