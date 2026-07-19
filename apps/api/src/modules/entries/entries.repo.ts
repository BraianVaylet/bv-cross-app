import type { ObjectId } from 'mongodb';
import { rmEntries } from '../../db/collections.js';
import type { RmEntryDoc } from '../../db/types.js';

/**
 * Queries del módulo entries. Las propias filtran SIEMPRE por userId; la
 * vista del CRM por orgId + userId (docs/05-seguridad.md §2) — el stamping
 * de orgId (RN-21) hace que esa query solo devuelva catálogo (RN-20).
 */

export interface ListOpts {
  exerciseId?: ObjectId;
  after?: ObjectId;
  limit: number;
}

/**
 * Orden RN-22: date desc, _id desc (misma fecha → gana la creada después).
 * Cursor compuesto: `after` es un _id; se retoma desde la posición de ese
 * documento en el orden, no por _id puro (el orden primario es la fecha).
 */
async function listOrdered(
  base: Record<string, unknown>,
  opts: ListOpts,
): Promise<RmEntryDoc[]> {
  const match: Record<string, unknown> = { ...base };
  if (opts.exerciseId) match.exerciseId = opts.exerciseId;

  if (opts.after) {
    const pivot = await rmEntries().findOne({ ...base, _id: opts.after });
    if (!pivot) return []; // cursor ajeno o borrado: página vacía, sin oráculo
    match.$or = [
      { date: { $lt: pivot.date } },
      { date: pivot.date, _id: { $lt: pivot._id } },
    ];
    if (opts.exerciseId) match.exerciseId = opts.exerciseId;
  }

  return rmEntries()
    .find(match)
    .sort({ date: -1, _id: -1 })
    .limit(opts.limit + 1)
    .toArray();
}

export function listOwn(userId: ObjectId, opts: ListOpts): Promise<RmEntryDoc[]> {
  return listOrdered({ userId }, opts);
}

/** Vista CRM (RN-20): orgId stampeado ⇒ solo entries sobre catálogo de esa org. */
export function listForMemberInOrg(
  orgId: ObjectId,
  userId: ObjectId,
  opts: ListOpts,
): Promise<RmEntryDoc[]> {
  return listOrdered({ orgId, userId }, opts);
}

export function findOwn(userId: ObjectId, id: ObjectId): Promise<RmEntryDoc | null> {
  return rmEntries().findOne({ _id: id, userId });
}

export function countOwnForExercise(userId: ObjectId, exerciseId: ObjectId): Promise<number> {
  return rmEntries().countDocuments({ userId, exerciseId });
}

export async function insertEntry(doc: RmEntryDoc): Promise<void> {
  await rmEntries().insertOne(doc);
}

export async function deleteOwn(userId: ObjectId, id: ObjectId): Promise<boolean> {
  const res = await rmEntries().deleteOne({ _id: id, userId });
  return res.deletedCount === 1;
}
