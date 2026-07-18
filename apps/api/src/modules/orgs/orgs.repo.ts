import type { ObjectId } from 'mongodb';
import { memberships, organizations, users } from '../../db/collections.js';
import type { MembershipDoc, OrganizationDoc, UserDoc } from '../../db/types.js';

/**
 * Queries del módulo orgs. organizations/users son colecciones globales;
 * las de memberships filtran siempre por orgId (docs/05-seguridad.md §2).
 */

export function findUserById(userId: ObjectId): Promise<UserDoc | null> {
  return users().findOne({ _id: userId });
}

export function findOrgById(orgId: ObjectId): Promise<OrganizationDoc | null> {
  return organizations().findOne({ _id: orgId });
}

export function findOrgByJoinCode(code: string): Promise<OrganizationDoc | null> {
  return organizations().findOne({ joinCode: code });
}

/** Slugs que compiten con el candidato: exacto o con sufijo numérico. */
export async function listSlugsLike(base: string): Promise<string[]> {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = await organizations()
    .find({ slug: { $regex: `^${escaped}(-\\d+)?$` } }, { projection: { slug: 1 } })
    .toArray();
  return rows.map((r) => r.slug);
}

/** Lanza E11000 si slug o joinCode colisionan (índices únicos). */
export async function insertOrg(doc: OrganizationDoc): Promise<void> {
  await organizations().insertOne(doc);
}

export async function updateOrgFields(
  orgId: ObjectId,
  set: Record<string, unknown>,
): Promise<void> {
  await organizations().updateOne({ _id: orgId }, { $set: { ...set, updatedAt: new Date() } });
}

/** Lanza E11000 si el código nuevo colisiona. */
export async function setJoinCode(orgId: ObjectId, joinCode: string): Promise<void> {
  await organizations().updateOne(
    { _id: orgId },
    { $set: { joinCode, updatedAt: new Date() } },
  );
}

export function findMembership(orgId: ObjectId, userId: ObjectId): Promise<MembershipDoc | null> {
  return memberships().findOne({ orgId, userId });
}

export function findInvitedByEmail(
  orgId: ObjectId,
  email: string,
): Promise<MembershipDoc | null> {
  return memberships().findOne({ orgId, status: 'invited', userId: null, invitedEmail: email });
}

/** Lanza E11000 si ya existe {orgId, userId} (carrera de doble join). */
export async function insertMembership(doc: MembershipDoc): Promise<void> {
  await memberships().insertOne(doc);
}

/**
 * Vinculación de invitado (Funcional F2): la ficha pre-cargada pasa a ser del
 * usuario conservando profile/adminNotes. Atómica: el filtro userId:null
 * garantiza que solo un join la reclama.
 */
export function linkInvitedMembership(
  membershipId: ObjectId,
  userId: ObjectId,
): Promise<MembershipDoc | null> {
  return memberships().findOneAndUpdate(
    { _id: membershipId, status: 'invited', userId: null },
    { $set: { userId, status: 'active', joinedAt: new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}
