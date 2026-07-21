import type { ObjectId } from 'mongodb';
import type { PackAssignmentStatus } from '@bv/contracts';
import { memberships, packAssignments } from '../../db/collections.js';
import type { MembershipDoc, PackAssignmentDoc } from '../../db/types.js';

/**
 * Queries de assignments. Todas filtran por orgId (docs/05-seguridad.md §2):
 * el historial de packs es de la org, no global del usuario.
 */

export function findMembership(orgId: ObjectId, membershipId: ObjectId): Promise<MembershipDoc | null> {
  return memberships().findOne({ orgId, _id: membershipId });
}

export async function insertAssignment(doc: PackAssignmentDoc): Promise<void> {
  await packAssignments().insertOne(doc);
}

export function findAssignment(orgId: ObjectId, id: ObjectId): Promise<PackAssignmentDoc | null> {
  return packAssignments().findOne({ orgId, _id: id });
}

export function listAssignments(
  orgId: ObjectId,
  userId: ObjectId,
  status?: PackAssignmentStatus,
): Promise<PackAssignmentDoc[]> {
  return packAssignments()
    .find({ orgId, userId, ...(status ? { status } : {}) })
    .sort({ createdAt: -1 })
    .toArray();
}

export function updateAssignment(
  orgId: ObjectId,
  id: ObjectId,
  set: Record<string, unknown>,
): Promise<PackAssignmentDoc | null> {
  return packAssignments().findOneAndUpdate(
    { orgId, _id: id },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}
