import type {
  BookingCreditsDto,
  BookingDto,
  BookingWithSessionDto,
  CreateBookingBody,
  CreditPackDto,
  CreditsDto,
  MyBookingsQuery,
  Page,
} from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import type { BookingDoc, ClassSessionDoc, PackAssignmentDoc } from '../../db/types.js';
import { book, cancelByUser } from './booking-service.js';
import { listMyAssignments, listMyBookings, type BookingWithSession } from './bookings.repo.js';

type OrgContext = AppVariables['org'];

/**
 * Capa HTTP del módulo bookings (F4-02): parsea, llama al servicio de dominio
 * (F4-01) y arma DTOs. **Cero lógica de negocio propia** — cupos y créditos se
 * deciden en `booking-service.ts` o en ningún lado.
 */

function toBookingDto(doc: BookingDoc): BookingDto {
  return {
    id: doc._id.toHexString(),
    sessionId: doc.sessionId.toHexString(),
    userId: doc.userId.toHexString(),
    packAssignmentId: doc.packAssignmentId.toHexString(),
    status: doc.status,
    bookedAt: doc.bookedAt.toISOString(),
    ...(doc.cancelledAt !== undefined ? { cancelledAt: doc.cancelledAt.toISOString() } : {}),
  };
}

function toBookingWithSessionDto(row: BookingWithSession): BookingWithSessionDto {
  const { session, ...booking } = row;
  return {
    ...toBookingDto(booking),
    session: {
      id: session._id.toHexString(),
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      discipline: session.discipline,
      ...(session.description !== undefined ? { description: session.description } : {}),
      capacity: session.capacity,
      bookedCount: session.bookedCount,
      status: session.status,
    },
  };
}

/** Saldo del pack que se acaba de tocar, para pintar el número sin refetch. */
function toCredits(assignment: PackAssignmentDoc): BookingCreditsDto {
  return {
    remaining: assignment.snapshot.classCount - assignment.classesUsed,
    packName: assignment.snapshot.name,
    expiresAt: assignment.expiresAt.toISOString(),
  };
}

export async function createBooking(
  org: OrgContext,
  userId: string,
  body: CreateBookingBody,
): Promise<{
  booking: BookingDto;
  session: { id: string; bookedCount: number; capacity: number };
  credits: BookingCreditsDto;
}> {
  const result = await book(
    new ObjectId(userId),
    new ObjectId(org.orgId),
    new ObjectId(body.sessionId),
  );
  const session: ClassSessionDoc = result.session;
  return {
    booking: toBookingDto(result.booking),
    session: {
      id: session._id.toHexString(),
      bookedCount: session.bookedCount,
      capacity: session.capacity,
    },
    credits: toCredits(result.assignment),
  };
}

export async function cancelBooking(
  org: OrgContext,
  userId: string,
  bookingId: string,
): Promise<{ refunded: true; credits: BookingCreditsDto | null }> {
  const result = await cancelByUser(
    new ObjectId(userId),
    new ObjectId(org.orgId),
    new ObjectId(bookingId),
  );
  return {
    refunded: result.refunded,
    credits: result.assignment ? toCredits(result.assignment) : null,
  };
}

export async function listMyBookingsPage(
  org: OrgContext,
  userId: string,
  query: MyBookingsQuery,
): Promise<Page<BookingWithSessionDto>> {
  const rows = await listMyBookings(
    new ObjectId(org.orgId),
    new ObjectId(userId),
    query.scope,
    query.after ? new ObjectId(query.after) : null,
    query.limit + 1, // uno de más: así se sabe si hay página siguiente
  );
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toBookingWithSessionDto);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

const remainingOf = (a: PackAssignmentDoc): number => a.snapshot.classCount - a.classesUsed;

/** Usable AHORA: lo que el próximo `book` podría consumir (mismas condiciones que RN-11/12). */
const usableNow = (a: PackAssignmentDoc, now: Date): boolean =>
  a.status === 'active' && a.startsAt <= now && a.expiresAt > now && remainingOf(a) > 0;

const startsLater = (a: PackAssignmentDoc, now: Date): boolean =>
  a.status === 'active' && a.startsAt > now && a.expiresAt > now;

function toCreditPackDto(a: PackAssignmentDoc, now: Date): CreditPackDto {
  return {
    id: a._id.toHexString(),
    name: a.snapshot.name,
    remaining: remainingOf(a),
    total: a.snapshot.classCount,
    // El job de expiración corre cada hora: la lectura no le cree al status y
    // valida el reloj (docs/02-arquitectura.md §8).
    status: a.status === 'active' && a.expiresAt <= now ? 'expired' : a.status,
    startsAt: a.startsAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    ...(startsLater(a, now) ? { usableFrom: a.startsAt.toISOString() } : {}),
  };
}

/**
 * Saldo del atleta (F4-06). Orden: primero lo usable hoy por vencimiento asc
 * —el primero de la lista es el que se va a consumir (RN-12)—, después los que
 * arrancan más adelante y al final lo terminado, de lo más reciente a lo más
 * viejo.
 */
export async function myCredits(org: OrgContext, userId: string): Promise<CreditsDto> {
  const now = new Date();
  const docs = await listMyAssignments(new ObjectId(org.orgId), new ObjectId(userId));

  const usable = docs
    .filter((a) => usableNow(a, now))
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const future = docs
    .filter((a) => startsLater(a, now))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const done = docs
    .filter((a) => !usableNow(a, now) && !startsLater(a, now))
    .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());

  return {
    packs: [...usable, ...future, ...done].map((a) => toCreditPackDto(a, now)),
    totalRemaining: usable.reduce((sum, a) => sum + remainingOf(a), 0),
    nextExpiration: usable[0]?.expiresAt.toISOString() ?? null,
  };
}
