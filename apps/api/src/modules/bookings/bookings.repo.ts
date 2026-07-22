import type { BookingStatus } from '@bv/contracts';
import type { ClientSession, ObjectId } from 'mongodb';
import { bookings, classSessions, organizations, packAssignments } from '../../db/collections.js';
import type { BookingDoc, ClassSessionDoc, PackAssignmentDoc } from '../../db/types.js';

/**
 * Operaciones atómicas de reservas (docs/02-arquitectura.md §6).
 *
 * REGLA DEL MÓDULO: acá no hay `find` + `update` separados para decidir cupo o
 * crédito. Cada condición vive DENTRO del filtro del update, así el servidor
 * resuelve la carrera; si el filtro no matchea, la operación devuelve null y el
 * servicio aborta la transacción. Un check-then-act sería un bug de sobrecupo
 * esperando a dos atletas rápidos.
 *
 * Todas filtran por `orgId` (docs/05-seguridad.md §2).
 */

/** Toma un cupo: solo si la sesión está vigente y `bookedCount < capacity` (RN-06/RN-10). */
export function takeSeat(
  orgId: ObjectId,
  sessionId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<ClassSessionDoc | null> {
  return classSessions().findOneAndUpdate(
    {
      _id: sessionId,
      orgId,
      status: 'scheduled',
      startsAt: { $gt: now },
      $expr: { $lt: ['$bookedCount', '$capacity'] },
    },
    { $inc: { bookedCount: 1 }, $set: { updatedAt: now } },
    { returnDocument: 'after', session },
  );
}

/** Libera un cupo. El `$expr` evita que un doble refund deje `bookedCount` negativo. */
export async function releaseSeat(
  orgId: ObjectId,
  sessionId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<void> {
  await classSessions().updateOne(
    { _id: sessionId, orgId, $expr: { $gt: ['$bookedCount', 0] } },
    { $inc: { bookedCount: -1 }, $set: { updatedAt: now } },
    { session },
  );
}

/**
 * Consume un crédito del pack que vence primero (FIFO, RN-12).
 *
 * `startsAt <= now` deja afuera los packs con inicio futuro (F3-03) y
 * `expiresAt > now` no confía en el job de expiración (RN-11): el estado se
 * valida contra el reloj, no contra el último barrido. El pipeline hace el
 * `$inc` y la transición a `exhausted` (RN-13) en el MISMO update: nunca se
 * puede observar un pack `active` con `classesUsed == classCount`.
 */
export function consumeCredit(
  orgId: ObjectId,
  userId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<PackAssignmentDoc | null> {
  return packAssignments().findOneAndUpdate(
    {
      orgId,
      userId,
      status: 'active',
      startsAt: { $lte: now },
      expiresAt: { $gt: now },
      $expr: { $lt: ['$classesUsed', '$snapshot.classCount'] },
    },
    [
      {
        $set: {
          classesUsed: { $add: ['$classesUsed', 1] },
          status: {
            $cond: [
              { $gte: [{ $add: ['$classesUsed', 1] }, '$snapshot.classCount'] },
              'exhausted',
              'active',
            ],
          },
          updatedAt: '$$NOW',
        },
      },
    ],
    { sort: { expiresAt: 1 }, returnDocument: 'after', session },
  );
}

/**
 * Devuelve el crédito al pack de ORIGEN de la reserva (no al FIFO actual):
 * el atleta recupera lo que gastó, en el pack donde lo gastó.
 *
 * Reparación RN-13: si el pack quedó `exhausted` pero sigue vigente, vuelve a
 * `active`. Si está `expired` o `cancelled` el crédito se decrementa igual pero
 * el estado no cambia — crédito devuelto e inutilizable, que es exactamente lo
 * que dice RN-08 (el atleta no gana vigencia por cancelar).
 */
export function refundCredit(
  orgId: ObjectId,
  assignmentId: ObjectId,
  now: Date,
  session: ClientSession,
): Promise<PackAssignmentDoc | null> {
  return packAssignments().findOneAndUpdate(
    { _id: assignmentId, orgId },
    [
      {
        $set: {
          classesUsed: { $max: [0, { $subtract: ['$classesUsed', 1] }] },
          status: {
            $cond: [
              { $and: [{ $eq: ['$status', 'exhausted'] }, { $gt: ['$expiresAt', now] }] },
              'active',
              '$status',
            ],
          },
          updatedAt: '$$NOW',
        },
      },
    ],
    { returnDocument: 'after', session },
  );
}

/** Inserta la reserva. El índice único parcial (RN-07) rebota el doble-tap con E11000. */
export async function insertBooking(doc: BookingDoc, session: ClientSession): Promise<void> {
  await bookings().insertOne(doc, { session });
}

/**
 * Marca una reserva `booked` como cancelada. Devuelve el documento PREVIO: el
 * servicio necesita el `packAssignmentId` original para el refund y el null
 * distingue "no existe" de "ya estaba cancelada" (ambos → NOT_FOUND).
 */
export function markCancelled(
  filter: { _id: ObjectId; orgId: ObjectId; userId?: ObjectId },
  status: BookingStatus,
  now: Date,
  session: ClientSession,
): Promise<BookingDoc | null> {
  return bookings().findOneAndUpdate(
    { ...filter, status: 'booked' },
    { $set: { status, cancelledAt: now } },
    { returnDocument: 'before', session },
  );
}

/** Reservas activas de una sesión (para la cancelación del gimnasio, RN-09). */
export function listBookedOfSession(orgId: ObjectId, sessionId: ObjectId): Promise<BookingDoc[]> {
  return bookings().find({ orgId, sessionId, status: 'booked' }).toArray();
}

/** Lectura dentro de la transacción: ve el mismo snapshot que los updates. */
export function findSessionTx(
  orgId: ObjectId,
  sessionId: ObjectId,
  session: ClientSession,
): Promise<ClassSessionDoc | null> {
  return classSessions().findOne({ _id: sessionId, orgId }, { session });
}

/** Reserva con su clase embebida (la lista del atleta, F4-02). */
export interface BookingWithSession extends BookingDoc {
  session: ClassSessionDoc;
}

type Scope = 'upcoming' | 'history';

/**
 * Página de reservas del atleta con `$lookup` a la clase.
 *
 * `upcoming` son las vivas de clases que no empezaron (asc, la próxima
 * primero); `history` es todo el resto (desc, lo último primero). El cursor es
 * keyset sobre `(session.startsAt, _id)` — no alcanza con el `_id`, porque el
 * orden es por fecha de clase y no por fecha de reserva.
 */
export async function listMyBookings(
  orgId: ObjectId,
  userId: ObjectId,
  scope: Scope,
  after: ObjectId | null,
  limit: number,
): Promise<BookingWithSession[]> {
  const now = new Date();
  const asc = scope === 'upcoming';
  const dir = asc ? 1 : -1;
  const cmp = asc ? '$gt' : '$lt';

  const pipeline: Record<string, unknown>[] = [
    { $match: { orgId, userId } },
    {
      $lookup: {
        from: 'classSessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    {
      $match: asc
        ? { status: 'booked', 'session.startsAt': { $gt: now } }
        : { $or: [{ status: { $ne: 'booked' } }, { 'session.startsAt': { $lte: now } }] },
    },
  ];

  if (after) {
    const anchor = await bookings().findOne({ _id: after, orgId, userId });
    const anchorSession = anchor ? await classSessions().findOne({ _id: anchor.sessionId }) : null;
    // Cursor inválido (de otro usuario, borrado): se ignora y arranca de cero,
    // que es preferible a un 400 en una lista al scrollear.
    if (anchorSession) {
      pipeline.push({
        $match: {
          $or: [
            { 'session.startsAt': { [cmp]: anchorSession.startsAt } },
            { 'session.startsAt': anchorSession.startsAt, _id: { [cmp]: after } },
          ],
        },
      });
    }
  }

  pipeline.push({ $sort: { 'session.startsAt': dir, _id: dir } }, { $limit: limit });
  return bookings().aggregate<BookingWithSession>(pipeline).toArray();
}

/** Todas las asignaciones del atleta en la org: el saldo se arma en el servicio. */
export function listMyAssignments(orgId: ObjectId, userId: ObjectId): Promise<PackAssignmentDoc[]> {
  return packAssignments().find({ orgId, userId }).toArray();
}

/** Ventana de cancelación de la org (RN-08): se lee siempre, nunca se cachea. */
export async function cancellationWindowHours(
  orgId: ObjectId,
  session: ClientSession,
): Promise<number | null> {
  const doc = await organizations().findOne(
    { _id: orgId },
    { projection: { 'settings.cancellationWindowHours': 1 }, session },
  );
  return doc ? doc.settings.cancellationWindowHours : null;
}
