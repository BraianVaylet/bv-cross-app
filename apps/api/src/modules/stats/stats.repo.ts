import type { ObjectId } from 'mongodb';
import { exercises, memberships, rmEntries, users } from '../../db/collections.js';
import type { ExerciseDoc, MembershipDoc, RmEntryDoc } from '../../db/types.js';

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
