import { z } from 'zod';
import { calendarDate, objectIdString } from './core.js';
import { cursorQuery, page } from './pagination.js';

/**
 * Contratos del módulo entries — registros de carga (F2-02, RN-20/21/22/23).
 * XOR estructural de kg/reps acá; el cruce contra el TYPE del ejercicio
 * (WRONG_MEASURE) lo valida el server, que es quien conoce el ejercicio.
 */

/** kg 0.5..600 con hasta 2 decimales (sanidad, no récords mundiales). */
const kg = z
  .number()
  .min(0.5)
  .max(600)
  .refine((v) => Math.round(v * 100) / 100 === v, 'hasta 2 decimales');

const reps = z.number().int().min(1).max(500);

export const createEntryBody = z
  .object({
    exerciseId: objectIdString,
    kg: kg.optional(),
    reps: reps.optional(),
    date: calendarDate,
    comment: z.string().trim().max(300).optional(),
    painFlag: z.boolean().optional(),
  })
  .strict()
  .refine((body) => (body.kg === undefined) !== (body.reps === undefined), {
    message: 'exactamente una medida: kg o reps (RN-23)',
    path: ['kg'],
  });

export const entriesQuery = cursorQuery
  .extend({
    exerciseId: objectIdString.optional(),
  })
  .strict();

export const entryDto = z
  .object({
    id: objectIdString,
    exerciseId: objectIdString,
    kg: z.number().optional(),
    reps: z.number().optional(),
    date: calendarDate,
    comment: z.string().optional(),
    painFlag: z.boolean().optional(),
    createdAt: z.string(), // ISO
  })
  .strict();

export const entryPageDto = page(entryDto);

export type CreateEntryBody = z.infer<typeof createEntryBody>;
export type EntriesQuery = z.infer<typeof entriesQuery>;
export type EntryDto = z.infer<typeof entryDto>;
