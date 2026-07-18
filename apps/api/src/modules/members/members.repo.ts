import type { MembersQuery } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import { memberships, users } from '../../db/collections.js';
import type { MembershipDoc, UserDoc } from '../../db/types.js';

/**
 * Queries del módulo members. TODAS filtran por orgId como argumento
 * obligatorio (docs/05-seguridad.md §2): buscar por _id sin orgId es un bug
 * de seguridad aunque tenantGuard haya validado.
 */

export interface MemberRow extends MembershipDoc {
  user?: Pick<UserDoc, '_id' | 'name' | 'email'>;
}

const USER_LOOKUP = [
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
      pipeline: [{ $project: { name: 1, email: 1 } }],
    },
  },
  { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Página por _id desc; pide limit+1 para saber si hay siguiente. */
export function listMembers(orgId: ObjectId, query: MembersQuery): Promise<MemberRow[]> {
  const match: Record<string, unknown> = { orgId };
  if (query.status) match.status = query.status;
  if (query.after) match._id = { $lt: new ObjectId(query.after) };

  const pipeline: Record<string, unknown>[] = [{ $match: match }, ...USER_LOOKUP];
  if (query.q) {
    // Prefijo case-insensitive. Acentos NO se normalizan en fase 1
    // (mejora anotada: collation 'es' strength 1 — docs/tasks/F1.md F1-08).
    const rx = { $regex: `^${escapeRegex(query.q)}`, $options: 'i' };
    pipeline.push({
      $match: {
        $or: [
          { 'profile.displayName': rx },
          { invitedEmail: rx },
          { 'user.name': rx },
          { 'user.email': rx },
        ],
      },
    });
  }
  pipeline.push({ $sort: { _id: -1 } }, { $limit: query.limit + 1 });
  return memberships().aggregate<MemberRow>(pipeline).toArray();
}

export async function findMemberById(
  orgId: ObjectId,
  memberId: ObjectId,
): Promise<MemberRow | null> {
  const rows = await memberships()
    .aggregate<MemberRow>([{ $match: { orgId, _id: memberId } }, ...USER_LOOKUP])
    .toArray();
  return rows[0] ?? null;
}

/** Membresía de la org que ya usa ese email: pre-carga (invitedEmail) o vinculada. */
export async function findMembershipByEmail(
  orgId: ObjectId,
  email: string,
): Promise<MembershipDoc | null> {
  const invited = await memberships().findOne({ orgId, invitedEmail: email });
  if (invited) return invited;
  const user = await users().findOne({ email }, { projection: { _id: 1 } });
  if (!user) return null;
  return memberships().findOne({ orgId, userId: user._id });
}

export async function insertMember(doc: MembershipDoc): Promise<void> {
  await memberships().insertOne(doc);
}

export function updateMember(
  orgId: ObjectId,
  memberId: ObjectId,
  set: Record<string, unknown>,
): Promise<MembershipDoc | null> {
  return memberships().findOneAndUpdate(
    { orgId, _id: memberId },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}
