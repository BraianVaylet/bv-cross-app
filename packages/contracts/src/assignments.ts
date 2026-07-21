import { z } from 'zod';
import { calendarDate, isoDateString, objectIdString } from './core.js';
import { packAssignmentStatus, paymentMethod } from './enums.js';

/**
 * Contratos del módulo assignments (F3-03, RN-12/13/16/17/18).
 * El snapshot del pack es inmutable desde la creación: lo que el cliente
 * compró no cambia aunque el catálogo se edite después (RN-16).
 */

const amount = z.number().int().min(0);

export const createAssignmentBody = z
  .object({
    packId: objectIdString,
    /** Default: hoy en la timezone de la org. */
    startsAt: calendarDate.optional(),
    payment: z
      .object({
        /** Default: el precio del snapshot. Editable para registrar descuentos. */
        amount: amount.optional(),
        /** Default: el método del pack. */
        method: paymentMethod.optional(),
        /** Default: ahora. */
        paidAt: isoDateString.optional(),
        notes: z.string().trim().max(300).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const cancelAssignmentBody = z
  .object({ reason: z.string().trim().min(1).max(300) })
  .strict();

export const assignmentsQuery = z
  .object({ status: packAssignmentStatus.optional() })
  .strict();

/** Snapshot congelado del pack al momento de asignarlo (RN-16). */
export const assignmentSnapshotDto = z
  .object({
    name: z.string(),
    classCount: z.number(),
    durationDays: z.number(),
    price: z.number(),
    currency: z.literal('ARS'),
    paymentMethod,
  })
  .strict();

export const assignmentDto = z
  .object({
    id: objectIdString,
    packId: objectIdString,
    userId: objectIdString,
    snapshot: assignmentSnapshotDto,
    startsAt: z.string(), // ISO
    expiresAt: z.string(), // ISO — fin del día en tz de la org (RN-18)
    classesUsed: z.number(),
    /** Computado: `snapshot.classCount - classesUsed`. */
    remaining: z.number(),
    status: packAssignmentStatus,
    payment: z
      .object({
        amount: z.number(),
        method: paymentMethod,
        paidAt: z.string(), // ISO
        notes: z.string().optional(),
      })
      .strict(),
    cancelledReason: z.string().optional(),
    createdAt: z.string(), // ISO
  })
  .strict();

export type CreateAssignmentBody = z.infer<typeof createAssignmentBody>;
export type CancelAssignmentBody = z.infer<typeof cancelAssignmentBody>;
export type AssignmentsQuery = z.infer<typeof assignmentsQuery>;
export type AssignmentDto = z.infer<typeof assignmentDto>;
