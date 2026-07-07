import type { MembershipSummaryDto } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import { emailTokens, memberships, users } from '../../db/collections.js';
import type { EmailTokenDoc, UserDoc } from '../../db/types.js';

/**
 * Queries del módulo auth. Colecciones globales (users/emailTokens no
 * pertenecen a una org), por eso acá no aplica el filtro orgId obligatorio.
 */

export function findUserByEmail(email: string): Promise<UserDoc | null> {
  return users().findOne({ email });
}

export function findUserById(userId: ObjectId): Promise<UserDoc | null> {
  return users().findOne({ _id: userId });
}

/** Lanza MongoServerError E11000 si el email ya existe (índice único). */
export async function insertUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<UserDoc> {
  const now = new Date();
  const doc: UserDoc = {
    _id: new ObjectId(),
    email: input.email,
    emailVerifiedAt: null,
    name: input.name,
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  await users().insertOne(doc);
  return doc;
}

export async function updatePasswordHash(userId: ObjectId, passwordHash: string): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date() } });
}

export async function markEmailVerified(userId: ObjectId): Promise<void> {
  const now = new Date();
  await users().updateOne(
    { _id: userId, emailVerifiedAt: null },
    { $set: { emailVerifiedAt: now, updatedAt: now } },
  );
}

export async function insertEmailToken(input: {
  userId: ObjectId;
  purpose: EmailTokenDoc['purpose'];
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await emailTokens().insertOne({
    _id: new ObjectId(),
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  });
}

export function findEmailTokenByHash(tokenHash: string): Promise<EmailTokenDoc | null> {
  return emailTokens().findOne({ tokenHash });
}

/**
 * Un solo uso atómico: solo gana quien lo marca primero (filtro usedAt: null).
 * Devuelve null si ya estaba usado — mismo TOKEN_INVALID para el caller.
 */
export function consumeEmailToken(tokenId: ObjectId): Promise<EmailTokenDoc | null> {
  return emailTokens().findOneAndUpdate(
    { _id: tokenId, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );
}

export async function invalidateEmailTokens(
  userId: ObjectId,
  purpose: EmailTokenDoc['purpose'],
): Promise<void> {
  await emailTokens().updateMany(
    { userId, purpose, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );
}

/** Resumen para el selector de org: solo membresías visibles (active/invited). */
export async function listMembershipSummaries(userId: ObjectId): Promise<MembershipSummaryDto[]> {
  const rows = await memberships()
    .aggregate<{
      _id: ObjectId;
      orgId: ObjectId;
      role: MembershipSummaryDto['role'];
      status: MembershipSummaryDto['status'];
      org: { name: string };
    }>([
      { $match: { userId, status: { $in: ['active', 'invited'] } } },
      {
        $lookup: {
          from: 'organizations',
          localField: 'orgId',
          foreignField: '_id',
          as: 'org',
        },
      },
      { $unwind: '$org' },
      { $project: { orgId: 1, role: 1, status: 1, 'org.name': 1 } },
    ])
    .toArray();
  return rows.map((r) => ({
    id: r._id.toHexString(),
    orgId: r.orgId.toHexString(),
    orgName: r.org.name,
    role: r.role,
    status: r.status,
  }));
}
