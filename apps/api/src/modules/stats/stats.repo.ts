import type { ObjectId } from 'mongodb';
import {
  bookings,
  classSessions,
  exercises,
  memberships,
  organizations,
  packAssignments,
  rmEntries,
  users,
} from '../../db/collections.js';
import type {
  ClassSessionDoc,
  ExerciseDoc,
  MembershipDoc,
  PackAssignmentDoc,
  RmEntryDoc,
} from '../../db/types.js';

/**
 * Queries de stats (F3-09). **Todas filtran por `orgId`** (docs/05-seguridad.md
 * §2): son datos de los clientes del gimnasio.
 *
 * Los personales quedan afuera por construcción: las entries llevan `orgId`
 * stampeado solo cuando el ejercicio es de catálogo (RN-20/21), así que
 * filtrar por org ya excluye lo privado del atleta sin un filtro extra.
 */

/** Un ejercicio del catálogo de la org (para nombre y tipo). */
export function findCatalogExercise(orgId: ObjectId, id: ObjectId): Promise<ExerciseDoc | null> {
  return exercises().findOne({ _id: id, orgId, scope: 'org' });
}

/** Historial de un cliente sobre un ejercicio del catálogo, cronológico asc. */
export function listMemberProgress(
  orgId: ObjectId,
  userId: ObjectId,
  exerciseId: ObjectId,
): Promise<RmEntryDoc[]> {
  return rmEntries()
    .find({ orgId, userId, exerciseId })
    .sort({ date: 1, _id: 1 }) // `_id` desempata dos cargas del mismo día
    .toArray();
}

/** Ejercicios del catálogo sobre los que ESTE cliente ya cargó algo. */
export async function exercisesWithDataFor(
  orgId: ObjectId,
  userId: ObjectId,
): Promise<ExerciseDoc[]> {
  const ids = await rmEntries().distinct('exerciseId', { orgId, userId });
  if (ids.length === 0) return [];
  return exercises()
    .find({ _id: { $in: ids }, orgId, scope: 'org' })
    .sort({ name: 1 })
    .toArray();
}

export interface FeedRow extends RmEntryDoc {
  exercise: Pick<ExerciseDoc, 'name' | 'type'>;
}

/**
 * Candidatos para el feed de PRs.
 *
 * **Por qué así y no con `$setWindowFields`**: el máximo acumulado por
 * partición se puede calcular en el pipeline, pero después habría que
 * ordenar por fecha, cortar N y volver a resolver nombres — y el resultado
 * sigue dependiendo de leer TODO el historial de cada par para saber si la
 * última carga fue récord. Traemos las entries recientes de la org con su
 * ejercicio y la regla (`markPrs`) se aplica en el servicio, donde está
 * escrita una sola vez y testeada como función pura. Si el volumen lo pide,
 * el reemplazo es local a esta función.
 *
 * El `limit` es de entries examinadas, no de PRs devueltos: se pide de más
 * porque solo una fracción va a ser récord.
 */
export function listRecentEntriesWithExercise(orgId: ObjectId, limit: number): Promise<FeedRow[]> {
  return rmEntries()
    .aggregate<FeedRow>([
      { $match: { orgId } },
      { $sort: { date: -1, _id: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'exercises',
          localField: 'exerciseId',
          foreignField: '_id',
          as: 'exercise',
        },
      },
      { $unwind: '$exercise' },
      { $match: { 'exercise.scope': 'org' } },
    ])
    .toArray();
}

/** Historial completo de los pares que aparecen en el feed, para ubicar el récord. */
export function listHistoryForPairs(
  orgId: ObjectId,
  pairs: Array<{ userId: ObjectId; exerciseId: ObjectId }>,
): Promise<RmEntryDoc[]> {
  if (pairs.length === 0) return Promise.resolve([]);
  return rmEntries()
    .find({ orgId, $or: pairs.map((p) => ({ userId: p.userId, exerciseId: p.exerciseId })) })
    .sort({ date: 1, _id: 1 })
    .toArray();
}

/** Nombres de los atletas del feed (el DTO muestra a quién felicitar). */
export async function namesOf(userIds: ObjectId[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const docs = await users()
    .find({ _id: { $in: userIds } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray();
  return new Map(docs.map((u) => [u._id.toHexString(), u.name]));
}

/** La ficha del CRM en ESTA org (null = no existe acá → 404 sin oráculo). */
export function findMembership(
  orgId: ObjectId,
  membershipId: ObjectId,
): Promise<MembershipDoc | null> {
  return memberships().findOne({ _id: membershipId, orgId });
}

/* ─────────────────────────── Dashboard (F3-10) ───────────────────────────
 *
 * Seis bloques independientes, uno por pregunta, corridos con `Promise.all`
 * desde el servicio. No hay colección de snapshots a propósito
 * (docs/07-escalabilidad.md §2 fija el disparador para agregarla): con los
 * índices que ya existen, agregar en caliente entra holgado en presupuesto y
 * evita el problema real de los snapshots, que es quedar desfasados.
 *
 * Todas las ventanas llegan ya resueltas a instantes UTC: el cálculo de
 * "hoy", "esta semana" y "este mes" se hace en la tz de la org en el servicio
 * (`schedule-time.ts`), nunca acá ni en UTC.
 */

/** El nombre que ve el admin: el de la ficha, si no el de la cuenta. */
const MEMBER_NAME = {
  $ifNull: ['$profile.displayName', '$user.name', '$invitedEmail', '(sin nombre)'],
};

/** Clases de hoy con su ocupación. Las canceladas no ocupan lugar ni cuentan. */
export function listSessionsBetween(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<ClassSessionDoc[]> {
  return classSessions()
    .find({ orgId, status: 'scheduled', startsAt: { $gte: start, $lte: end } })
    .sort({ startsAt: 1 })
    .toArray();
}

/**
 * Reservas hechas y canceladas dentro de la ventana.
 *
 * Se cuenta por CUÁNDO pasó cada cosa, no por el estado actual: una reserva
 * hecha el lunes y cancelada el miércoles suma en las dos columnas, que es
 * exactamente lo que pasó esa semana. Contar solo las vivas escondería el
 * movimiento, que es justo lo que el bloque quiere mostrar.
 */
export async function countWeekActivity(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<{ bookings: number; cancellations: number }> {
  const ventana = { $gte: start, $lte: end };
  const [hechas, canceladas] = await Promise.all([
    bookings().countDocuments({ orgId, bookedAt: ventana }),
    bookings().countDocuments({ orgId, cancelledAt: ventana }),
  ]);
  return { bookings: hechas, cancellations: canceladas };
}

export interface ExpiringRow extends PackAssignmentDoc {
  membershipId: ObjectId;
  memberName: string;
}

/**
 * Packs activos que vencen dentro de la ventana. Solo `active`: un pack
 * agotado o cancelado que "vence" el jueves no es una venta por renovar.
 */
export function listExpiringAssignments(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<ExpiringRow[]> {
  return packAssignments()
    .aggregate<ExpiringRow>([
      { $match: { orgId, status: 'active', expiresAt: { $gte: start, $lte: end } } },
      { $sort: { expiresAt: 1 } },
      {
        $lookup: {
          from: 'memberships',
          let: { uid: '$userId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$orgId', orgId] }, { $eq: ['$userId', '$$uid'] }] } } },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user',
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $project: { name: MEMBER_NAME } },
          ],
          as: 'membership',
        },
      },
      { $unwind: '$membership' },
      { $set: { membershipId: '$membership._id', memberName: '$membership.name' } },
    ])
    .toArray();
}

export interface InactiveRow {
  _id: ObjectId;
  memberName: string;
  lastBookingAt: Date | null;
  since: Date;
}

/**
 * Miembros activos que hace rato no reservan.
 *
 * El corte se aplica DESPUÉS del `$lookup` porque la pregunta es por ausencia:
 * no hay documento de "no vino", así que hay que mirar a cada miembro activo y
 * ver qué tan vieja es su última reserva. Quien nunca reservó entra midiendo
 * desde el alta — si no, los que se anotaron y nunca aparecieron quedarían
 * invisibles, que son justo los que hay que llamar.
 */
export function listInactiveMembers(
  orgId: ObjectId,
  cutoff: Date,
  limit: number,
): Promise<InactiveRow[]> {
  return memberships()
    .aggregate<InactiveRow>([
      { $match: { orgId, status: 'active', role: 'athlete' } },
      {
        $lookup: {
          from: 'bookings',
          let: { uid: '$userId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$orgId', orgId] }, { $eq: ['$userId', '$$uid'] }] } } },
            { $sort: { bookedAt: -1 } },
            { $limit: 1 },
            { $project: { bookedAt: 1 } },
          ],
          as: 'ultima',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $set: {
          lastBookingAt: { $ifNull: [{ $first: '$ultima.bookedAt' }, null] },
          since: { $ifNull: ['$joinedAt', '$createdAt'] },
          memberName: MEMBER_NAME,
        },
      },
      { $match: { $expr: { $lt: [{ $ifNull: ['$lastBookingAt', '$since'] }, cutoff] } } },
      { $sort: { lastBookingAt: 1, since: 1 } },
      { $limit: limit },
      { $project: { memberName: 1, lastBookingAt: 1, since: 1 } },
    ])
    .toArray();
}

/** Facturado del mes: lo cobrado al asignar, no lo consumido (DEC-08). */
export async function sumRevenueBetween(
  orgId: ObjectId,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await packAssignments()
    .aggregate<{ total: number }>([
      // Las canceladas no facturaron: se devolvió la plata.
      { $match: { orgId, status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } },
    ])
    .toArray();
  return row?.total ?? 0;
}

/** Altas del mes: `joinedAt` es cuando la membresía pasó a activa. */
export function countNewMembers(orgId: ObjectId, start: Date, end: Date): Promise<number> {
  return memberships().countDocuments({ orgId, joinedAt: { $gte: start, $lte: end } });
}

/** La tz de la org: todas las ventanas del dashboard se cortan con ella. */
export function orgTimezone(orgId: ObjectId): Promise<{ timezone: string } | null> {
  return organizations()
    .find({ _id: orgId })
    .project<{ timezone: string }>({ timezone: 1 })
    .next();
}
