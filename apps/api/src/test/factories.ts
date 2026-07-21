import type { Role } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { Config } from '../config.js';
import {
  classSessions,
  classTemplates,
  exercises,
  memberships,
  organizations,
  packAssignments,
  packs,
  rmEntries,
  users,
} from '../db/collections.js';
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
  entry: async (orgId) => {
    // Entry de un usuario ajeno sobre catálogo de la org ajena (F2-02).
    const id = new ObjectId();
    await rmEntries().insertOne({
      _id: id,
      exerciseId: new ObjectId(),
      userId: new ObjectId(),
      orgId,
      kg: 100,
      date: '2026-01-01',
      createdAt: new Date(),
    });
    return id.toHexString();
  },
  template: async (orgId) => {
    // Plantilla de la grilla de la org ajena (F3-01).
    const now = new Date();
    const id = new ObjectId();
    await classTemplates().insertOne({
      _id: id,
      orgId,
      weekday: 1,
      startTime: '18:00',
      durationMin: 60,
      discipline: 'crossfit',
      capacity: 12,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
  assignment: async (orgId) => {
    // Asignación de un usuario ajeno en la org ajena (F3-03).
    const now = new Date();
    const id = new ObjectId();
    await packAssignments().insertOne({
      _id: id,
      orgId,
      userId: new ObjectId(),
      packId: new ObjectId(),
      snapshot: {
        name: 'Pack Ajeno',
        classCount: 8,
        durationDays: 30,
        price: 25_000,
        currency: 'ARS',
        paymentMethod: 'cash',
      },
      startsAt: now,
      expiresAt: new Date(now.getTime() + 30 * 86_400_000),
      classesUsed: 0,
      status: 'active',
      payment: { amount: 25_000, method: 'cash', paidAt: now },
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
  pack: async (orgId) => {
    // Pack del catálogo de la org ajena (F3-02).
    const now = new Date();
    const id = new ObjectId();
    await packs().insertOne({
      _id: id,
      orgId,
      name: `Pack Ajeno ${id.toHexString().slice(-4)}`,
      classCount: 8,
      durationDays: 30,
      price: 25_000,
      currency: 'ARS',
      paymentMethod: 'cash',
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
  session: async (orgId) => {
    // Sesión materializada de la org ajena (F3-01).
    const now = new Date();
    const id = new ObjectId();
    const startsAt = new Date(Date.now() + 86_400_000);
    await classSessions().insertOne({
      _id: id,
      orgId,
      templateId: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      discipline: 'crossfit',
      capacity: 12,
      bookedCount: 0,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    });
    return id.toHexString();
  },
};
