import type { Role } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { Config } from '../config.js';
import { exercises, memberships, organizations, users } from '../db/collections.js';
import type { MembershipStatus } from '@bv/contracts';
import { issueAccessToken } from '../modules/auth/token-service.js';
import type { ResourceKind } from '../route-policies.js';

/**
 * Factories para la suite de aislamiento (docs/tasks/F1.md F1-09) y para
 * cualquier test de integración: nunca fixtures JSON gigantes ([Testing §1]).
 */

export interface TestUser {
  id: ObjectId;
  email: string;
  token: string;
}

export async function makeUser(config: Config, email: string, name = 'Test'): Promise<TestUser> {
  const now = new Date();
  const id = new ObjectId();
  await users().insertOne({
    _id: id,
    email,
    emailVerifiedAt: now,
    name,
    passwordHash: 'scrypt$32768$8$1$x$x',
    createdAt: now,
    updatedAt: now,
  });
  return { id, email, token: await issueAccessToken(id.toHexString(), config) };
}

export async function makeOrg(name: string): Promise<ObjectId> {
  const now = new Date();
  const id = new ObjectId();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.toHexString().slice(-6)}`;
  await organizations().insertOne({
    _id: id,
    name,
    slug,
    joinCode: `${slug.slice(0, 20)}-${id.toHexString().slice(-4)}`,
    timezone: 'America/Argentina/Buenos_Aires',
    settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function makeMembership(
  orgId: ObjectId,
  userId: ObjectId,
  role: Role,
  status: MembershipStatus = 'active',
): Promise<ObjectId> {
  const now = new Date();
  const id = new ObjectId();
  await memberships().insertOne({
    _id: id,
    orgId,
    userId,
    role,
    status,
    profile: {},
    ...(status === 'active' ? { joinedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Catálogo de recursos org-scoped para el test de IDOR: cada factory crea el
 * recurso en la org dada y devuelve su `:id` en hex. Fases futuras suman
 * `exercise`, `entry`, `template`, `session`, `pack`, `assignment`, `booking`.
 */
export const RESOURCE_FACTORIES: Record<
  ResourceKind,
  (orgId: ObjectId) => Promise<string>
> = {
  membership: async (orgId) => {
    // Ficha pre-cargada 'invited' (no necesita un user real detrás).
    const now = new Date();
    const id = new ObjectId();
    await memberships().insertOne({
      _id: id,
      orgId,
      userId: null,
      role: 'athlete',
      status: 'invited',
      profile: { displayName: 'Recurso Ajeno' },
      invitedEmail: `idor-${id.toHexString()}@test.com`,
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
  exercise: async (orgId) => {
    // Ejercicio de catálogo de la org ajena (F2-01).
    const now = new Date();
    const id = new ObjectId();
    await exercises().insertOne({
      _id: id,
      scope: 'org',
      orgId,
      ownerUserId: null,
      name: `Ajeno ${id.toHexString().slice(-6)}`,
      type: 'weight',
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
};
