import type { ObjectId } from 'mongodb';
import { exercises, rmEntries } from '../../db/collections.js';
import { getClient } from '../../db/client.js';
import type { ExerciseDoc } from '../../db/types.js';

/**
 * Queries del módulo exercises. Las de catálogo SIEMPRE filtran por orgId
 * (docs/05-seguridad.md §2); las personales por ownerUserId — cross-org
 * a propósito (RN-21), pero jamás devuelven personales ajenos (RN-20).
 */

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Invariante de documento (spec F2-01): scope ⇔ orgId/ownerUserId. */
function assertScopeInvariant(doc: ExerciseDoc): void {
  const orgOk = doc.scope === 'org' && doc.orgId !== null && doc.ownerUserId === null;
  const personalOk = doc.scope === 'personal' && doc.orgId === null && doc.ownerUserId !== null;
  if (!orgOk && !personalOk) {
    throw new Error(`exercises: invariante de scope violada (scope=${doc.scope})`);
  }
}

export interface ListFilter {
  orgId: ObjectId;
  userId: ObjectId;
  scope: 'org' | 'personal' | 'all';
  includeArchived: boolean;
}

export function listExercises(filter: ListFilter): Promise<ExerciseDoc[]> {
  const catalog = {
    scope: 'org' as const,
    orgId: filter.orgId,
    ...(filter.includeArchived ? {} : { archivedAt: { $exists: false } }),
  };
  const personal = { scope: 'personal' as const, ownerUserId: filter.userId };
  const match =
    filter.scope === 'org' ? catalog : filter.scope === 'personal' ? personal : { $or: [catalog, personal] };
  return exercises().find(match).sort({ name: 1 }).toArray();
}

/**
 * Visibilidad de lectura (RN-20/21): catálogo de la org activa (incluso
 * archivado — el historial sigue legible) o personal propio. Lo demás: null.
 */
export function findVisible(
  orgId: ObjectId,
  userId: ObjectId,
  id: ObjectId,
): Promise<ExerciseDoc | null> {
  return exercises().findOne({
    _id: id,
    $or: [
      { scope: 'org', orgId },
      { scope: 'personal', ownerUserId: userId },
    ],
  });
}

/** Unicidad blanda de nombre en el catálogo (case-insensitive, spec F2-01). */
export function findCatalogByName(
  orgId: ObjectId,
  name: string,
  excludeId?: ObjectId,
): Promise<ExerciseDoc | null> {
  return exercises().findOne({
    scope: 'org',
    orgId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
}

export async function insertExercise(doc: ExerciseDoc): Promise<void> {
  assertScopeInvariant(doc);
  await exercises().insertOne(doc);
}

export function updateExercise(
  id: ObjectId,
  set: Record<string, unknown>,
  unset: string[] = [],
): Promise<ExerciseDoc | null> {
  return exercises().findOneAndUpdate(
    { _id: id },
    {
      $set: { ...set, updatedAt: new Date() },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
    },
    { returnDocument: 'after' },
  );
}

/** Archivar/restaurar: solo catálogo de la org (RN-19). Personal → no match. */
export function setArchived(
  orgId: ObjectId,
  id: ObjectId,
  archived: boolean,
): Promise<ExerciseDoc | null> {
  return exercises().findOneAndUpdate(
    { _id: id, scope: 'org', orgId },
    archived
      ? { $set: { archivedAt: new Date(), updatedAt: new Date() } }
      : { $unset: { archivedAt: '' }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}

export function countEntries(exerciseId: ObjectId): Promise<number> {
  return rmEntries().countDocuments({ exerciseId });
}

/**
 * Borrado de personal con cascada de entries (comportamiento v1) en una
 * transacción: nunca quedan entries huérfanas.
 */
export async function deletePersonalWithEntries(ownerUserId: ObjectId, id: ObjectId): Promise<boolean> {
  const session = getClient().startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const res = await exercises().deleteOne({ _id: id, scope: 'personal', ownerUserId }, { session });
      deleted = res.deletedCount === 1;
      if (deleted) await rmEntries().deleteMany({ exerciseId: id }, { session });
    });
    return deleted;
  } finally {
    await session.endSession();
  }
}
