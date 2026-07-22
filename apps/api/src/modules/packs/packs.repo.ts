import type { ObjectId } from 'mongodb';
import { packAssignments, packs } from '../../db/collections.js';
import type { PackDoc } from '../../db/types.js';

/**
 * Queries del catálogo de packs. TODAS filtran por orgId
 * (docs/05-seguridad.md §2), incluso las que ya reciben un `_id`.
 */

export function listPacks(orgId: ObjectId, includeArchived: boolean): Promise<PackDoc[]> {
  return packs()
    .find({ orgId, ...(includeArchived ? {} : { archivedAt: { $exists: false } }) })
    .sort({ name: 1 })
    .toArray();
}

export function findPack(orgId: ObjectId, id: ObjectId): Promise<PackDoc | null> {
  return packs().findOne({ orgId, _id: id });
}

export async function insertPack(doc: PackDoc): Promise<void> {
  await packs().insertOne(doc);
}

export function updatePack(
  orgId: ObjectId,
  id: ObjectId,
  set: Record<string, unknown>,
  unset: string[] = [],
): Promise<PackDoc | null> {
  return packs().findOneAndUpdate(
    { orgId, _id: id },
    {
      $set: { ...set, updatedAt: new Date() },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
    },
    { returnDocument: 'after' },
  );
}

export async function deletePack(orgId: ObjectId, id: ObjectId): Promise<boolean> {
  const res = await packs().deleteOne({ orgId, _id: id });
  return res.deletedCount === 1;
}

/** Asignaciones vigentes del pack: las que congelan la matriz RN-14. */
export function countActiveAssignments(packId: ObjectId): Promise<number> {
  return packAssignments().countDocuments({ packId, status: 'active' });
}

/** Cualquier asignación, en cualquier estado: bloquea el DELETE (RN-15). */
export function countAnyAssignments(packId: ObjectId): Promise<number> {
  return packAssignments().countDocuments({ packId });
}

/** Conteo de activas para varios packs de una (lista sin N+1). */
export async function activeAssignmentsByPack(
  packIds: ObjectId[],
): Promise<Map<string, number>> {
  if (packIds.length === 0) return new Map();
  const rows = await packAssignments()
    .aggregate<{ _id: ObjectId; n: number }>([
      { $match: { packId: { $in: packIds }, status: 'active' } },
      { $group: { _id: '$packId', n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id.toHexString(), r.n]));
}
