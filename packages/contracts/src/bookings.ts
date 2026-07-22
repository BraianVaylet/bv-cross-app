import { z } from 'zod';
import { objectIdString } from './core.js';
import { bookingStatus, packAssignmentStatus, sessionStatus } from './enums.js';
import { cursorQuery } from './pagination.js';

/**
 * Contratos del módulo bookings (F4-02, RN-06..13).
 *
 * Las respuestas de reservar y cancelar traen el saldo resultante: el atleta
 * ve el número nuevo en el mismo tap, sin un refetch que puede fallar o llegar
 * tarde (docs/tasks/F4.md).
 */

export const createBookingBody = z.object({ sessionId: objectIdString }).strict();

export const myBookingsQuery = cursorQuery
  .extend({
    /** `upcoming`: reservas vivas de clases que no empezaron, más próxima primero. */
    scope: z.enum(['upcoming', 'history']).default('upcoming'),
  })
  .strict();

export const bookingDto = z
  .object({
    id: objectIdString,
    sessionId: objectIdString,
    userId: objectIdString,
    packAssignmentId: objectIdString,
    status: bookingStatus,
    bookedAt: z.string(), // ISO
    cancelledAt: z.string().optional(), // ISO
  })
  .strict();

/** Reserva con su clase embebida: la lista del atleta no necesita otra llamada. */
export const bookingWithSessionDto = bookingDto
  .extend({
    session: z
      .object({
        id: objectIdString,
        startsAt: z.string(), // ISO
        endsAt: z.string(), // ISO
        discipline: z.string(),
        description: z.string().optional(),
        capacity: z.number(),
        bookedCount: z.number(),
        status: sessionStatus,
      })
      .strict(),
  })
  .strict();

/** Saldo resultante de la operación, del pack que se consumió o recuperó. */
export const bookingCreditsDto = z
  .object({
    remaining: z.number(),
    packName: z.string(),
    expiresAt: z.string(), // ISO
  })
  .strict();

/** Un pack en la pantalla de saldo (F4-06). */
export const creditPackDto = z
  .object({
    id: objectIdString,
    name: z.string(),
    remaining: z.number(),
    total: z.number(),
    status: packAssignmentStatus,
    startsAt: z.string(), // ISO
    expiresAt: z.string(), // ISO
    /**
     * Presente solo si el pack todavía no arrancó: el FE muestra
     * "disponible desde el lunes" en vez de un saldo que no se puede usar.
     */
    usableFrom: z.string().optional(), // ISO
  })
  .strict();

export const creditsDto = z
  .object({
    /** Activos primero por `expiresAt` asc: el primero es el que consume FIFO (RN-12). */
    packs: z.array(creditPackDto),
    /** Suma de lo usable AHORA: excluye vencidos, agotados y los de inicio futuro. */
    totalRemaining: z.number(),
    nextExpiration: z.string().nullable(), // ISO
  })
  .strict();

export type CreateBookingBody = z.infer<typeof createBookingBody>;
export type MyBookingsQuery = z.infer<typeof myBookingsQuery>;
export type BookingDto = z.infer<typeof bookingDto>;
export type BookingWithSessionDto = z.infer<typeof bookingWithSessionDto>;
export type BookingCreditsDto = z.infer<typeof bookingCreditsDto>;
export type CreditPackDto = z.infer<typeof creditPackDto>;
export type CreditsDto = z.infer<typeof creditsDto>;
