import { z } from 'zod';
import { objectIdString } from './core.js';

/** Query de paginación por cursor (docs/02-arquitectura.md §9). */
export const cursorQuery = z
  .object({
    after: objectIdString.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type CursorQuery = z.infer<typeof cursorQuery>;

/** Página de resultados: items + cursor del siguiente (null = no hay más). */
export const page = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      items: z.array(item),
      nextCursor: objectIdString.nullable(),
    })
    .strict();

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
