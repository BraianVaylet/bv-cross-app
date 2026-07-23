import { z } from 'zod';
import { objectIdString } from './core.js';
import { exerciseScope, exerciseType } from './enums.js';

/**
 * Contratos del módulo exercises (F2-01, RN-19/20/21/23).
 * Una colección, dos alcances: catálogo de la org (admins) y personales
 * del atleta (privados, cross-org).
 */

const exerciseName = z.string().trim().min(1).max(80);
const discipline = z.string().trim().min(1).max(40);
const imageUrl = z.string().url().startsWith('https://', 'la imagen debe ser https');
const notes = z.string().max(500);

export const createExerciseBody = z
  .object({
    name: exerciseName,
    discipline: discipline.optional(),
    type: exerciseType,
    /** Sin scope → 'personal'. 'org' requiere exercises:manage-catalog. */
    scope: exerciseScope.default('personal'),
    imageUrl: imageUrl.optional(),
    notes: notes.optional(),
  })
  .strict();

/** El scope no se transfiere; el type solo cambia sin entries (TYPE_LOCKED). */
export const updateExerciseBody = z
  .object({
    name: exerciseName.optional(),
    discipline: discipline.nullable().optional(),
    type: exerciseType.optional(),
    imageUrl: imageUrl.nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .strict();

export const exercisesQuery = z
  .object({
    scope: z.enum(['org', 'personal', 'all']).default('all'),
    /** Solo admin (RN-19): '1' incluye archivados del catálogo. */
    includeArchived: z
      .enum(['1', '0'])
      .optional()
      .transform((v) => v === '1'),
  })
  .strict();

export const exerciseDto = z
  .object({
    id: objectIdString,
    scope: exerciseScope,
    name: z.string(),
    discipline: z.string().optional(),
    type: exerciseType,
    imageUrl: z.string().optional(),
    notes: z.string().optional(),
    archivedAt: z.string().optional(), // ISO — solo scope 'org' (RN-19)
    /**
     * `true` si ya tiene registros de carga: el CRM bloquea el cambio de tipo
     * (TYPE_LOCKED, RN-23) antes del error. Solo lo devuelve el listado admin
     * del catálogo; en el resto de las vistas viaja `undefined`.
     */
    hasEntries: z.boolean().optional(),
    createdAt: z.string(), // ISO
    updatedAt: z.string(), // ISO
  })
  .strict();

export type CreateExerciseBody = z.infer<typeof createExerciseBody>;
export type UpdateExerciseBody = z.infer<typeof updateExerciseBody>;
export type ExercisesQuery = z.infer<typeof exercisesQuery>;
export type ExerciseDto = z.infer<typeof exerciseDto>;
