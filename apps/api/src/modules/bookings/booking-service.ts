import { ObjectId } from 'mongodb';
import type { BookingDoc, ClassSessionDoc, PackAssignmentDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { withTransaction } from '../../lib/mongo-tx.js';
import { findSession, updateSession } from '../schedule/schedule.repo.js';
import {
  cancellationWindowHours,
  consumeCredit,
  findSessionTx,
  insertBooking,
  listBookedOfSession,
  markCancelled,
  refundCredit,
  releaseSeat,
  takeSeat,
} from './bookings.repo.js';

/**
 * Servicio de dominio de reservas (docs/tasks/F4.md F4-01).
 *
 * Las tres operaciones que tocan cupos y créditos viven acá y solo acá: cupo,
 * crédito y reserva se mueven juntos o no se mueven. Toda condición de carrera
 * se resuelve en el filtro del update (ver `bookings.repo.ts`); este archivo
 * decide qué error ve el usuario y en qué orden pasan las cosas.
 */

export interface BookResult {
  booking: BookingDoc;
  /** Sesión y pack YA actualizados: la UI pinta cupo y saldo sin volver a pedir (F4-02). */
  session: ClassSessionDoc;
  assignment: PackAssignmentDoc;
}

export interface CancelResult {
  refunded: true;
  booking: BookingDoc;
  assignment: PackAssignmentDoc | null;
}

export interface GymCancelResult {
  session: ClassSessionDoc;
  cancelled: number;
  failed: number;
}

/**
 * Sentinela interna: el paso 1 falló y hay que averiguar POR QUÉ fuera de la
 * transacción. Diagnosticar adentro obligaría a leer la sesión antes de
 * tocarla, que es justo el check-then-act que este módulo evita.
 */
class SeatUnavailable extends Error {}

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/** Instante límite para que el atleta cancele su reserva (RN-08). */
export function cancellationDeadline(startsAt: Date, windowHours: number): Date {
  return new Date(startsAt.getTime() - windowHours * 3_600_000);
}

/**
 * Regla RN-08, fijada acá: cancelar EXACTAMENTE en el límite todavía se
 * permite (`>=`). Con ventana 0 se cancela hasta el instante de arranque.
 */
export function isCancellable(now: Date, startsAt: Date, windowHours: number): boolean {
  return now.getTime() <= cancellationDeadline(startsAt, windowHours).getTime();
}

/** Traduce "no pude tomar el cupo" al código correcto con una lectura simple. */
async function diagnoseSeat(orgId: ObjectId, sessionId: ObjectId, now: Date): Promise<DomainError> {
  const doc = await findSession(orgId, sessionId);
  if (!doc) return new DomainError('NOT_FOUND', 'La clase no existe.');
  if (doc.status === 'cancelled') return new DomainError('SESSION_CANCELLED', 'La clase fue cancelada.');
  if (doc.startsAt <= now) return new DomainError('SESSION_STARTED', 'La clase ya empezó.');
  // Puede haberse liberado un lugar entre el abort y esta lectura: el atleta
  // reintenta y entra. Informar "completa" es correcto para el intento que falló.
  return new DomainError('SESSION_FULL', 'La clase está completa.');
}

/**
 * Reserva (RN-06/07/10/11/12/13). Orden fijo: cupo → crédito → reserva. El
 * cupo primero porque es el recurso escaso y compartido; si falla, ningún pack
 * se tocó. Cualquier abort posterior revierte el `$inc` del cupo con la
 * transacción — nunca queda un lugar fantasma.
 */
export async function book(
  userId: ObjectId,
  orgId: ObjectId,
  sessionId: ObjectId,
): Promise<BookResult> {
  const now = new Date();
  try {
    return await withTransaction('book', async (tx) => {
      const session = await takeSeat(orgId, sessionId, now, tx);
      if (!session) throw new SeatUnavailable();

      const assignment = await consumeCredit(orgId, userId, now, tx);
      if (!assignment) {
        throw new DomainError('NO_CREDITS', 'No tenés clases disponibles: comprá un pack en el gimnasio.');
      }

      const booking: BookingDoc = {
        _id: new ObjectId(),
        orgId,
        sessionId,
        userId,
        packAssignmentId: assignment._id,
        status: 'booked',
        bookedAt: now,
      };
      try {
        await insertBooking(booking, tx);
      } catch (err) {
        if (isDuplicateKey(err)) throw new DomainError('ALREADY_BOOKED', 'Ya estás anotado en esta clase.');
        throw err;
      }
      return { booking, session, assignment };
    });
  } catch (err) {
    if (err instanceof SeatUnavailable) throw await diagnoseSeat(orgId, sessionId, now);
    throw err;
  }
}

/**
 * Cancelación por el atleta (RN-08). La reserva se marca primero: es el
 * candado que impide que dos cancelaciones simultáneas devuelvan el crédito
 * dos veces. Si la ventana está cerrada, el abort deshace la marca.
 */
export async function cancelByUser(
  userId: ObjectId,
  orgId: ObjectId,
  bookingId: ObjectId,
): Promise<CancelResult> {
  const now = new Date();
  return withTransaction('cancelByUser', async (tx) => {
    const previous = await markCancelled({ _id: bookingId, orgId, userId }, 'cancelled_by_user', now, tx);
    if (!previous) throw new DomainError('NOT_FOUND', 'La reserva no existe o ya fue cancelada.');

    const session = await findSessionTx(orgId, previous.sessionId, tx);
    if (!session) throw new DomainError('NOT_FOUND', 'La clase de la reserva no existe.');

    const windowHours = await cancellationWindowHours(orgId, tx);
    if (windowHours === null) throw new DomainError('NOT_FOUND', 'La organización no existe.');

    if (!isCancellable(now, session.startsAt, windowHours)) {
      throw new DomainError(
        'CANCELLATION_WINDOW_CLOSED',
        `La clase se cancela hasta ${windowHours} h antes de empezar.`,
        { deadline: cancellationDeadline(session.startsAt, windowHours).toISOString() },
      );
    }

    await releaseSeat(orgId, previous.sessionId, now, tx);
    const assignment = await refundCredit(orgId, previous.packAssignmentId, now, tx);
    return {
      refunded: true as const,
      booking: { ...previous, status: 'cancelled_by_user' as const, cancelledAt: now },
      assignment,
    };
  });
}

/**
 * Cancelación de la sesión completa por el gimnasio (RN-09): devuelve TODOS
 * los créditos sin mirar la ventana — la clase no se da por decisión del gym,
 * el atleta no paga esa cuenta.
 *
 * Una transacción por reserva, no una gigante: 40 anotados en una sola
 * transacción es una invitación al conflicto de escritura, y una falla parcial
 * dejaría todo sin devolver. Idempotente: re-invocar sobre una sesión ya
 * cancelada no encuentra reservas `booked` y no hace nada.
 */
export async function cancelSessionByGym(
  orgId: ObjectId,
  sessionId: ObjectId,
  actorUserId: ObjectId,
): Promise<GymCancelResult> {
  const now = new Date();
  const marked = await updateSession(orgId, sessionId, { status: 'cancelled' });
  if (!marked) throw new DomainError('NOT_FOUND', 'La sesión no existe.');

  const pending = await listBookedOfSession(orgId, sessionId);
  let cancelled = 0;
  let failed = 0;

  for (const doc of pending) {
    try {
      const refunded = await withTransaction('cancelSessionByGym', async (tx) => {
        const previous = await markCancelled({ _id: doc._id, orgId }, 'cancelled_by_gym', now, tx);
        if (!previous) return false; // se canceló sola en el medio: nada que devolver
        await releaseSeat(orgId, sessionId, now, tx);
        await refundCredit(orgId, previous.packAssignmentId, now, tx);
        return true;
      });
      if (refunded) cancelled += 1;
    } catch (err) {
      // Nunca dejar la sesión a medio cancelar en silencio: se sigue con las
      // demás y el fallo viaja en el resultado para que el CRM lo muestre.
      failed += 1;
      logger.error(
        { err, orgId, sessionId, bookingId: doc._id, actorUserId },
        'devolución de crédito fallida al cancelar la sesión',
      );
    }
  }

  logger.info({ orgId, sessionId, actorUserId, cancelled, failed }, 'sesión cancelada por el gimnasio');
  const session = (await findSession(orgId, sessionId)) ?? marked;
  return { session, cancelled, failed };
}
