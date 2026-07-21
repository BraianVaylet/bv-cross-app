import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
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
import { DEMO_ORG_SLUG, DEMO_PASSWORD, runSeed } from './seed.js';
import { testConfig } from './test/helpers.js';
import { startTestDb, stopTestDb } from './test/mongo.js';

const config = testConfig();
const app = createApp(config);

describe('seed de desarrollo (F1-11)', () => {
  beforeAll(startTestDb, 120_000);
  afterAll(stopTestDb);

  it('guard: NODE_ENV=production → aborta con error sin tocar la DB', async () => {
    await expect(runSeed('production')).rejects.toThrow(/prohibido en producción/);
    expect(await organizations().countDocuments({ slug: DEMO_ORG_SLUG })).toBe(0);
  });

  it('idempotente: dos corridas seguidas sin error y sin duplicados', async () => {
    const first = await runSeed('development');
    const second = await runSeed('development');

    expect(await organizations().countDocuments({ slug: DEMO_ORG_SLUG })).toBe(1);
    expect(await users().countDocuments({ email: /@demo\.test$/ })).toBe(6);
    const org = await organizations().findOne({ slug: DEMO_ORG_SLUG });
    expect(await memberships().countDocuments({ orgId: org?._id })).toBe(7);
    // la segunda corrida recrea la org: id nuevo, datos equivalentes
    expect(second.memberships).toBe(first.memberships);
    expect(second.templates).toBe(first.templates);
  });

  it('la grilla lun–sáb queda materializada a 14 días (F3-01)', async () => {
    const res = await runSeed('development');
    const org = await organizations().findOne({ slug: DEMO_ORG_SLUG });

    // 6 días × 5 turnos de crossfit + hyrox martes y jueves
    expect(res.templates).toBe(32);
    expect(await classTemplates().countDocuments({ orgId: org?._id })).toBe(32);

    const sessions = await classSessions().find({ orgId: org?._id }).toArray();
    expect(sessions.length).toBe(res.sessions);
    expect(sessions.length).toBeGreaterThan(0);
    // ninguna en el pasado y ninguna más allá del horizonte de la org
    const now = Date.now();
    const horizon = now + 15 * 86_400_000;
    expect(sessions.every((s) => s.startsAt.getTime() > now)).toBe(true);
    expect(sessions.every((s) => s.startsAt.getTime() < horizon)).toBe(true);
    expect(sessions.every((s) => s.status === 'scheduled')).toBe(true);
    // solo las 3 próximas tienen anotados (F4-01)
    expect(sessions.filter((s) => s.bookedCount > 0)).toHaveLength(3);
  });

  it('el catálogo de packs queda cargado (F3-02)', async () => {
    const res = await runSeed('development');
    const org = await organizations().findOne({ slug: DEMO_ORG_SLUG });

    expect(res.packs).toBe(2);
    const docs = await packs().find({ orgId: org?._id }).sort({ price: 1 }).toArray();
    expect(docs.map((p) => [p.classCount, p.price, p.paymentMethod])).toEqual([
      [8, 25_000, 'cash'],
      [12, 32_000, 'debit'],
    ]);
    expect(docs.every((p) => p.archivedAt === undefined)).toBe(true);
  });

  it('las 4 asignaciones cubren los estados de la pantalla de saldo (F3-03)', async () => {
    const res = await runSeed('development');
    const org = await organizations().findOne({ slug: DEMO_ORG_SLUG });

    expect(res.assignments).toBe(4);
    const docs = await packAssignments()
      .find({ orgId: org?._id })
      .sort({ classesUsed: 1, status: 1 })
      .toArray();
    // los créditos consumidos incluyen las reservas del seed (F4-01)
    expect(docs.map((a) => [a.classesUsed, a.status])).toEqual([
      [3, 'active'], // recién comprada, ya con 3 clases anotadas
      [6, 'active'], // mitad usada, vence en 15 días
      [8, 'exhausted'], // se agotó reservando: transición RN-13 real
      [8, 'expired'], // vencida y agotada
    ]);
    // el snapshot viaja completo en todas (RN-16)
    expect(docs.every((a) => a.snapshot.classCount === 8 && a.snapshot.price === 25_000)).toBe(true);
  });

  it('las reservas del seed dejan los contadores coherentes (F4-01)', async () => {
    const res = await runSeed('development');
    const org = await organizations().findOne({ slug: DEMO_ORG_SLUG });

    expect(res.bookings).toBe(7);
    const docs = await bookings().find({ orgId: org?._id }).toArray();
    expect(docs).toHaveLength(7);
    expect(docs.every((b) => b.status === 'booked')).toBe(true);

    // bookedCount de cada sesión == reservas activas contra ella
    const sessions = await classSessions().find({ orgId: org?._id, bookedCount: { $gt: 0 } }).toArray();
    for (const session of sessions) {
      expect(session.bookedCount).toBe(docs.filter((b) => b.sessionId.equals(session._id)).length);
    }
    // ninguna reserva cuelga de un pack inexistente
    const assignmentIds = (await packAssignments().find({ orgId: org?._id }).toArray()).map((a) =>
      a._id.toHexString(),
    );
    expect(docs.every((b) => assignmentIds.includes(b.packAssignmentId.toHexString()))).toBe(true);
  });

  it('login owner@demo.test OK; /me/memberships muestra la org; GET /members lista 7 fichas', async () => {
    await runSeed('development');

    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@demo.test', password: DEMO_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const login = (await loginRes.json()) as {
      accessToken: string;
      memberships: { orgId: string; orgSlug: string; role: string }[];
    };
    expect(login.memberships).toHaveLength(1);
    expect(login.memberships[0]?.orgSlug).toBe(DEMO_ORG_SLUG);
    expect(login.memberships[0]?.role).toBe('owner');

    const membersRes = await app.request('/api/v1/members?limit=20', {
      headers: {
        authorization: `Bearer ${login.accessToken}`,
        'x-org-id': login.memberships[0]?.orgId ?? '',
      },
    });
    expect(membersRes.status).toBe(200);
    const page = (await membersRes.json()) as {
      items: { status: string; adminNotes?: string; profile: { displayName?: string } }[];
    };
    expect(page.items).toHaveLength(7);
    const invited = page.items.find((m) => m.status === 'invited');
    expect(invited?.adminNotes).toBe('Lesión de hombro — progresión suave');
  });
});
