import { ObjectId } from 'mongodb';
import { memberships, organizations, users } from './db/collections.js';
import { hashPassword } from './lib/crypto.js';
import { logger } from './lib/logger.js';

/**
 * Seed de desarrollo (docs/tasks/F1.md F1-11): org demo completa para
 * levantar cualquier FE contra datos realistas. Idempotente: borra la org
 * demo y sus datos antes de recrear. Cada fase posterior lo extiende en el
 * mismo PR del módulo (F2: ejercicios y RMs · F3: templates, packs,
 * assignments, sesiones · F4: reservas).
 */

export const DEMO_ORG_SLUG = 'bahia-cross-demo';
export const DEMO_PASSWORD = 'Demo!1234';

const DEMO_EMAILS = [
  'owner@demo.test',
  'admin@demo.test',
  'atleta1@demo.test',
  'atleta2@demo.test',
  'atleta3@demo.test',
  'atleta4@demo.test',
  'atleta5@demo.test',
] as const;

export interface SeedSummary {
  orgId: string;
  users: number;
  memberships: number;
}

export async function runSeed(nodeEnv: string | undefined = process.env.NODE_ENV): Promise<SeedSummary> {
  if (nodeEnv === 'production') {
    throw new Error('db:seed está prohibido en producción (guard F1-11).');
  }

  // Idempotencia: barrer la org demo y sus datos (también estados a medias
  // de una corrida anterior fallida). Los refresh tokens de users borrados
  // quedan huérfanos hasta que el TTL los limpie — inofensivo en dev.
  const existing = await organizations().findOne({ slug: DEMO_ORG_SLUG });
  if (existing) {
    await memberships().deleteMany({ orgId: existing._id });
    await organizations().deleteOne({ _id: existing._id });
  }
  await users().deleteMany({ email: { $in: [...DEMO_EMAILS] } });

  const now = new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD); // uno solo: mismo password universal

  const orgId = new ObjectId();
  await organizations().insertOne({
    _id: orgId,
    name: 'Bahía Cross',
    slug: DEMO_ORG_SLUG,
    joinCode: DEMO_ORG_SLUG,
    timezone: 'America/Argentina/Buenos_Aires',
    settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // atleta5 NO se registra: queda como pre-carga 'invited' del CRM.
  const registered: { email: (typeof DEMO_EMAILS)[number]; name: string; role: 'owner' | 'admin' | 'athlete' }[] = [
    { email: 'owner@demo.test', name: 'Olivia Dueña', role: 'owner' },
    { email: 'admin@demo.test', name: 'Andrés Coach', role: 'admin' },
    { email: 'atleta1@demo.test', name: 'Ana Fuerte', role: 'athlete' },
    { email: 'atleta2@demo.test', name: 'Bruno Rápido', role: 'athlete' },
    { email: 'atleta3@demo.test', name: 'Carla Constante', role: 'athlete' },
    { email: 'atleta4@demo.test', name: 'Diego Nuevo', role: 'athlete' },
  ];

  await users().insertMany(
    registered.map((u) => ({
      _id: new ObjectId(),
      email: u.email,
      emailVerifiedAt: now, // todos verificados: login directo en dev
      name: u.name,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const byEmail = new Map<string, ObjectId>();
  for await (const u of users().find({ email: { $in: registered.map((r) => r.email) } })) {
    byEmail.set(u.email, u._id);
  }

  await memberships().insertMany([
    ...registered.map((u) => {
      const userId = byEmail.get(u.email);
      if (!userId) throw new Error(`seed: user recién insertado no encontrado (${u.email})`);
      return {
        _id: new ObjectId(),
        orgId,
        userId,
        role: u.role,
        status: 'active' as const,
        profile: { displayName: u.name.split(' ')[0] },
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    }),
    {
      _id: new ObjectId(),
      orgId,
      userId: null,
      role: 'athlete' as const,
      status: 'invited' as const,
      profile: { displayName: 'Emilia' },
      invitedEmail: 'atleta5@demo.test',
      adminNotes: 'Lesión de hombro — progresión suave',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const summary: SeedSummary = {
    orgId: orgId.toHexString(),
    users: registered.length,
    memberships: registered.length + 1,
  };
  logger.info({ ...summary, slug: DEMO_ORG_SLUG }, 'seed done');
  return summary;
}
