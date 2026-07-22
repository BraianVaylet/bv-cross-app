import { z } from 'zod';
import { objectIdString } from './core.js';
import { paymentMethod } from './enums.js';

/**
 * Contratos del módulo packs (F3-02, RN-14/15/16).
 * `currency` no se acepta en los bodies: la fija el server en 'ARS'.
 * Los precios son enteros de pesos (sin centavos).
 */

const packName = z.string().trim().min(1).max(60);
const classCount = z.number().int().min(1).max(100);
const durationDays = z.number().int().min(1).max(365);
const price = z.number().int().min(0);
const internalNotes = z.string().trim().max(500);

export const createPackBody = z
  .object({
    name: packName,
    classCount,
    durationDays,
    price,
    paymentMethod,
    internalNotes: internalNotes.optional(),
  })
  .strict();

/**
 * PATCH: el server aplica la matriz RN-14 — `name` e `internalNotes` siempre;
 * el resto solo mientras el pack no tenga asignaciones `active`.
 */
export const updatePackBody = z
  .object({
    name: packName.optional(),
    internalNotes: internalNotes.nullable().optional(),
    classCount: classCount.optional(),
    durationDays: durationDays.optional(),
    price: price.optional(),
    paymentMethod: paymentMethod.optional(),
  })
  .strict();

export const packsQuery = z
  .object({
    includeArchived: z
      .enum(['1', '0'])
      .optional()
      .transform((v) => v === '1'),
  })
  .strict();

export const packDto = z
  .object({
    id: objectIdString,
    name: z.string(),
    classCount: z.number(),
    durationDays: z.number(),
    price: z.number(),
    currency: z.literal('ARS'),
    paymentMethod,
    internalNotes: z.string().optional(),
    archivedAt: z.string().optional(), // ISO — RN-15
    /** Cuántas asignaciones `active` lo usan: la UI comunica la matriz RN-14. */
    activeAssignments: z.number(),
    createdAt: z.string(), // ISO
    updatedAt: z.string(), // ISO
  })
  .strict();

export type CreatePackBody = z.infer<typeof createPackBody>;
export type UpdatePackBody = z.infer<typeof updatePackBody>;
export type PacksQuery = z.infer<typeof packsQuery>;
export type PackDto = z.infer<typeof packDto>;
