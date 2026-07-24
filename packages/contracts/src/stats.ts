import { z } from 'zod';
import { calendarDate, objectIdString } from './core.js';
import { exerciseType } from './enums.js';

/**
 * Contratos del módulo stats (F3-09, primeros endpoints).
 * Todo lo de acá es admin-only y siempre org-scoped: son datos de los
 * clientes del gimnasio (docs/05-seguridad.md §2).
 */

export const progressQuery = z.object({ exerciseId: objectIdString }).strict();

/** Un punto del gráfico de progreso. */
export const progressPointDto = z
  .object({
    id: objectIdString,
    /** kg o reps, según el tipo del ejercicio (RN-23). */
    value: z.number(),
    date: calendarDate,
    comment: z.string().optional(),
    painFlag: z.boolean().optional(),
    /** Superó todas las marcas anteriores (definición de PR, F3-09). */
    isPr: z.boolean(),
  })
  .strict();

export const progressDto = z
  .object({
    exerciseId: objectIdString,
    exerciseName: z.string(),
    type: exerciseType,
    /** Cronológico ascendente: el gráfico lo dibuja tal cual. */
    points: z.array(progressPointDto),
    /**
     * RN-22: el vigente es el de FECHA más reciente, no el mayor valor.
     * `null` si el cliente todavía no cargó nada de este ejercicio.
     */
    currentRm: z.number().nullable(),
    /** El mejor histórico, que puede no ser el vigente. */
    best: z.number().nullable(),
  })
  .strict();

export const prsFeedQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

export const prEntryDto = z
  .object({
    id: objectIdString,
    userId: objectIdString,
    userName: z.string(),
    exerciseId: objectIdString,
    exerciseName: z.string(),
    type: exerciseType,
    value: z.number(),
    /** Cuánto superó la marca anterior; `null` si fue su primera carga. */
    improvement: z.number().nullable(),
    date: calendarDate,
  })
  .strict();

export type ProgressQuery = z.infer<typeof progressQuery>;
export type ProgressPointDto = z.infer<typeof progressPointDto>;
export type ProgressDto = z.infer<typeof progressDto>;
export type PrsFeedQuery = z.infer<typeof prsFeedQuery>;
export type PrEntryDto = z.infer<typeof prEntryDto>;
