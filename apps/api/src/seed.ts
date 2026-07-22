import { ObjectId } from 'mongodb';
import {
  bookings,
  classSessions,
  classTemplates,
  memberships,
  organizations,
  packAssignments,
  packs,
  users,
} from './db/collections.js';
import type { ClassTemplateDoc, PackDoc } from './db/types.js';
import { hashPassword } from './lib/crypto.js';
import { logger } from './lib/logger.js';
import { book } from './modules/bookings/booking-service.js';
import { materializeTemplate } from './modules/schedule/schedule.service.js';

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
  templates: number;
  sessions: number;
  packs: number;
  assignments: number;
  bookings: number;
}

/** Catálogo de packs del box demo (F3-02). */
const DEMO_PACKS: Array<Pick<PackDoc, 'name' | 'classCount' | 'durationDays' | 'price' | 'paymentMethod'>> = [
  { name: '8 clases', classCount: 8, durationDays: 30, price: 25_000, paymentMethod: 'cash' },
  { name: '12 clases', classCount: 12, durationDays: 30, price: 32_000, paymentMethod: 'debit' },
];

/** Grilla del box (F3-01): lun–sáb de crossfit + hyrox martes y jueves. */
const GRID: Array<{ weekday: number; startTime: string; discipline: string }> = [
  ...[1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    ['08:30', '09:30', '17:30', '18:30', '19:30'].map((startTime) => ({
      weekday,
      startTime,
      discipline: 'crossfit',
    })),
  ),
  { weekday: 2, startTime: '10:30', discipline: 'hyrox' },
  { weekday: 4, startTime: '10:30', discipline: 'hyrox' },
];

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
    await classSessions().deleteMany({ orgId: existing._id });
    await classTemplates().deleteMany({ orgId: existing._id });
    await packs().deleteMany({ orgId: existing._id });
    await packAssignments().deleteMany({ orgId: existing._id });
    await bookings().deleteMany({ orgId: existing._id });
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

  // Grilla semanal + su materialización a 14 días (F3-01).
  const templateDocs: ClassTemplateDoc[] = GRID.map((slot) => ({
    _id: new ObjectId(),
    orgId,
    weekday: slot.weekday,
    startTime: slot.startTime,
    durationMin: 60,
    discipline: slot.discipline,
    capacity: 12,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
  await classTemplates().insertMany(templateDocs);

  let sessions = 0;
  for (const template of templateDocs) {
    sessions += await materializeTemplate(orgId, template, now);
  }

  // Catálogo de packs (F3-02).
  const packDocs: PackDoc[] = DEMO_PACKS.map((p) => ({
    _id: new ObjectId(),
    orgId,
    ...p,
    currency: 'ARS' as const,
    createdAt: now,
    updatedAt: now,
  }));
  await packs().insertMany(packDocs);

  // Asignaciones de partida (F3-03). Los créditos que faltan hasta el estado
  // final los consumen las reservas de más abajo, con el servicio real: así el
  // saldo, los anotados y `bookedCount` cuentan la misma historia.
  const pack8 = packDocs[0];
  if (!pack8) throw new Error('seed: falta el pack de 8 clases');
  const snapshot = {
    name: pack8.name,
    classCount: pack8.classCount,
    durationDays: pack8.durationDays,
    price: pack8.price,
    currency: pack8.currency,
    paymentMethod: pack8.paymentMethod,
  };
  const day = 86_400_000;
  const assignmentPlan: Array<{
    email: string;
    classesUsed: number;
    startsAt: Date;
    expiresAt: Date;
    status: 'active' | 'expired';
  }> = [
    { email: 'atleta1@demo.test', classesUsed: 0, startsAt: now, expiresAt: new Date(now.getTime() + 30 * day), status: 'active' },
    { email: 'atleta2@demo.test', classesUsed: 4, startsAt: new Date(now.getTime() - 15 * day), expiresAt: new Date(now.getTime() + 15 * day), status: 'active' },
    { email: 'atleta3@demo.test', classesUsed: 6, startsAt: new Date(now.getTime() - 27 * day), expiresAt: new Date(now.getTime() + 3 * day), status: 'active' },
    { email: 'atleta4@demo.test', classesUsed: 8, startsAt: new Date(now.getTime() - 40 * day), expiresAt: new Date(now.getTime() - 10 * day), status: 'expired' },
  ];
  await packAssignments().insertMany(
    assignmentPlan.map((a) => {
      const userId = byEmail.get(a.email);
      if (!userId) throw new Error(`seed: falta el usuario ${a.email}`);
      return {
        _id: new ObjectId(),
        orgId,
        userId,
        packId: pack8._id,
        snapshot,
        startsAt: a.startsAt,
        expiresAt: a.expiresAt,
        classesUsed: a.classesUsed,
        status: a.status,
        payment: { amount: snapshot.price, method: snapshot.paymentMethod, paidAt: a.startsAt },
        createdAt: a.startsAt,
        updatedAt: a.startsAt,
      };
    }),
  );

  // Reservas reales sobre las 3 próximas clases (F4-01): pasan por el
  // booking-service, no por un insert directo — el seed nunca inventa un
  // estado que la API no podría producir. Deja a atleta3 con el pack agotado
  // (transición RN-13) para que el CRM muestre también ese caso.
  const upcoming = await classSessions()
    .find({ orgId, startsAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .limit(3)
    .toArray();
  const attendees = [
    ['atleta1@demo.test', 'atleta2@demo.test', 'atleta3@demo.test'],
    ['atleta1@demo.test', 'atleta2@demo.test', 'atleta3@demo.test'],
    ['atleta1@demo.test'],
  ];
  let bookingCount = 0;
  for (const [i, session] of upcoming.entries()) {
    for (const email of attendees[i] ?? []) {
      const userId = byEmail.get(email);
      if (!userId) throw new Error(`seed: falta el usuario ${email}`);
      await book(userId, orgId, session._id);
      bookingCount += 1;
    }
  }

  const summary: SeedSummary = {
    orgId: orgId.toHexString(),
    users: registered.length,
    memberships: registered.length + 1,
    templates: templateDocs.length,
    sessions,
    packs: DEMO_PACKS.length,
    assignments: assignmentPlan.length,
    bookings: bookingCount,
  };
  logger.info({ ...summary, slug: DEMO_ORG_SLUG }, 'seed done');
  return summary;
}
