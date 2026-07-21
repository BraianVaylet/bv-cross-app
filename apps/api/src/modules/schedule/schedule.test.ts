import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { bookings, classSessions, classTemplates, organizations } from '../../db/collections.js';
import { materializeSessionsJob } from '../../jobs/materialize-sessions.js';
import { makeMembership, makeOrg, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

const config = testConfig();
const app = createApp(config);

let orgA: ObjectId;
let admin: TestUser;
let athlete: TestUser;

interface CallOpts {
  method?: string;
  token: string;
  body?: unknown;
}

async function call(path: string, opts: CallOpts): Promise<Response> {
  return app.request(path, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.token}`,
      'x-org-id': orgA.toHexString(),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const TEMPLATE = {
  weekday: 1, // lunes
  startTime: '18:00',
  durationMin: 60,
  discipline: 'crossfit',
  capacity: 12,
};

async function createTemplate(body: Record<string, unknown> = {}): Promise<string> {
  const res = await call('/api/v1/templates', {
    method: 'POST',
    token: admin.token,
    body: { ...TEMPLATE, ...body },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { template: { id: string } }).template.id;
}

/** Marca una sesión como si tuviera anotados (F4-01 hace esto de verdad). */
async function fakeBooking(sessionId: ObjectId, userId: ObjectId): Promise<void> {
  await classSessions().updateOne({ _id: sessionId }, { $set: { bookedCount: 1 } });
  await bookings().insertOne({
    _id: new ObjectId(),
    orgId: orgA,
    sessionId,
    userId,
    packAssignmentId: new ObjectId(),
    status: 'booked',
    bookedAt: new Date(),
  });
}

describe('schedule (F3-01)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Horario'); // tz America/Argentina/Buenos_Aires, 14 días
    admin = await makeUser(config, 'admin@sch.test', 'Admin');
    athlete = await makeUser(config, 'atleta@sch.test', 'Atleta');
    await makeMembership(orgA, admin.id, 'admin');
    await makeMembership(orgA, athlete.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    await Promise.all([
      classTemplates().deleteMany({}),
      classSessions().deleteMany({}),
      bookings().deleteMany({}),
    ]);
  });

  it('caso 4: el job corrido dos veces no duplica sesiones', async () => {
    await createTemplate();
    const afterCreate = await classSessions().countDocuments({ orgId: orgA });
    expect(afterCreate).toBeGreaterThan(0); // el POST ya materializa

    const first = await materializeSessionsJob.run();
    const second = await materializeSessionsJob.run();

    expect(first.modified).toBe(0); // ya estaban creadas
    expect(second.modified).toBe(0);
    expect(await classSessions().countDocuments({ orgId: orgA })).toBe(afterCreate);
  });

  it('caso 5: el horizonte respeta sessionGenerationDays de cada org', async () => {
    // orgA con 14 días vs orgB con 28: el doble de lunes materializados
    await createTemplate();
    const countA = await classSessions().countDocuments({ orgId: orgA });

    const orgB = await makeOrg('Box Largo');
    await organizations().updateOne(
      { _id: orgB },
      { $set: { 'settings.sessionGenerationDays': 28 } },
    );
    const now = new Date();
    await classTemplates().insertOne({
      _id: new ObjectId(),
      orgId: orgB,
      ...TEMPLATE,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await materializeSessionsJob.run();

    const countB = await classSessions().countDocuments({ orgId: orgB });
    expect(countB).toBeGreaterThan(countA);
    await classSessions().deleteMany({ orgId: orgB });
    await classTemplates().deleteMany({ orgId: orgB });
    await organizations().deleteOne({ _id: orgB });
  });

  it('caso 6: nunca materializa sesiones ya empezadas', async () => {
    await createTemplate();
    const now = new Date();
    const past = await classSessions().countDocuments({ orgId: orgA, startsAt: { $lte: now } });
    expect(past).toBe(0);
  });

  it('caso 7: template inactivo deja de materializar; sus sesiones quedan', async () => {
    const id = await createTemplate();
    const before = await classSessions().countDocuments({ orgId: orgA });
    expect(before).toBeGreaterThan(0);

    const res = await call(`/api/v1/templates/${id}`, {
      method: 'PATCH',
      token: admin.token,
      body: { active: false },
    });
    expect(res.status).toBe(200);

    await materializeSessionsJob.run();
    // desactivar borra las futuras libres y no regenera
    expect(await classSessions().countDocuments({ orgId: orgA })).toBe(0);

    // pero si tenía anotados, esas sesiones sobreviven
    const id2 = await createTemplate({ weekday: 3, startTime: '19:00' });
    const session = await classSessions().findOne({ orgId: orgA });
    if (!session) throw new Error('fixture: sin sesión');
    await fakeBooking(session._id, athlete.id);
    await call(`/api/v1/templates/${id2}`, {
      method: 'PATCH',
      token: admin.token,
      body: { active: false },
    });
    expect(await classSessions().countDocuments({ _id: session._id })).toBe(1);
  });

  it('caso 8: PATCH regenera las futuras libres y respeta las que tienen anotados', async () => {
    const id = await createTemplate();
    const sessions = await classSessions().find({ orgId: orgA }).sort({ startsAt: 1 }).toArray();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const withBooking = sessions[0];
    if (!withBooking) throw new Error('fixture: sin sesión');
    await fakeBooking(withBooking._id, athlete.id);

    const res = await call(`/api/v1/templates/${id}`, {
      method: 'PATCH',
      token: admin.token,
      body: { capacity: 20 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { regeneratedSessions: number; keptSessions: number };
    expect(body.keptSessions).toBe(1);
    expect(body.regeneratedSessions).toBe(sessions.length - 1);

    // la que tenía reserva conserva el cupo viejo; las regeneradas toman el nuevo
    const kept = await classSessions().findOne({ _id: withBooking._id });
    expect(kept?.capacity).toBe(12);
    const regenerated = await classSessions().findOne({
      orgId: orgA,
      _id: { $ne: withBooking._id },
    });
    expect(regenerated?.capacity).toBe(20);
  });

  it('caso 9: DELETE informa sesiones borradas y conservadas', async () => {
    const id = await createTemplate();
    const sessions = await classSessions().find({ orgId: orgA }).sort({ startsAt: 1 }).toArray();
    const withBooking = sessions[0];
    if (!withBooking) throw new Error('fixture: sin sesión');
    await fakeBooking(withBooking._id, athlete.id);

    const res = await call(`/api/v1/templates/${id}`, { method: 'DELETE', token: admin.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      deletedSessions: sessions.length - 1,
      keptSessions: 1,
    });
    expect(await classTemplates().countDocuments({ _id: new ObjectId(id) })).toBe(0);
    expect(await classSessions().countDocuments({ _id: withBooking._id })).toBe(1);
  });

  it('caso 10: rango de 45 días → 400', async () => {
    const res = await call('/api/v1/sessions?from=2026-01-01&to=2026-02-15', {
      token: athlete.token,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/31 días/);
  });

  it('caso 11: PATCH capacity por debajo de bookedCount → 409', async () => {
    await createTemplate();
    const session = await classSessions().findOne({ orgId: orgA });
    if (!session) throw new Error('fixture: sin sesión');
    await classSessions().updateOne({ _id: session._id }, { $set: { bookedCount: 5 } });

    const res = await call(`/api/v1/sessions/${session._id.toHexString()}`, {
      method: 'PATCH',
      token: admin.token,
      body: { capacity: 3 },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      'CAPACITY_BELOW_BOOKED',
    );
  });

  it('caso 12: cancelar con anotados → 409 HAS_BOOKINGS (pre-F4)', async () => {
    await createTemplate();
    const session = await classSessions().findOne({ orgId: orgA });
    if (!session) throw new Error('fixture: sin sesión');
    await fakeBooking(session._id, athlete.id);

    const res = await call(`/api/v1/sessions/${session._id.toHexString()}/cancel`, {
      method: 'POST',
      token: admin.token,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('HAS_BOOKINGS');

    // sin anotados sí cancela
    await classSessions().updateOne({ _id: session._id }, { $set: { bookedCount: 0 } });
    const ok = await call(`/api/v1/sessions/${session._id.toHexString()}/cancel`, {
      method: 'POST',
      token: admin.token,
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { session: { status: string } }).session.status).toBe('cancelled');
  });

  it('caso 13: myBookingId solo aparece para quien reservó', async () => {
    await createTemplate();
    const session = await classSessions().findOne({ orgId: orgA });
    if (!session) throw new Error('fixture: sin sesión');
    await fakeBooking(session._id, athlete.id);

    const range = `from=${new Date().toISOString().slice(0, 10)}&to=${new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)}`;

    const mine = await call(`/api/v1/sessions?${range}`, { token: athlete.token });
    const mineItems = ((await mine.json()) as { items: { id: string; myBookingId: string | null }[] }).items;
    expect(mineItems.find((s) => s.id === session._id.toHexString())?.myBookingId).not.toBeNull();

    const other = await call(`/api/v1/sessions?${range}`, { token: admin.token });
    const otherItems = ((await other.json()) as { items: { id: string; myBookingId: string | null }[] }).items;
    expect(otherItems.find((s) => s.id === session._id.toHexString())?.myBookingId).toBeNull();
  });

  it('solapamiento: se permite y se avisa en details.overlaps', async () => {
    await createTemplate(); // lunes 18:00-19:00
    const res = await call('/api/v1/templates', {
      method: 'POST',
      token: admin.token,
      body: { ...TEMPLATE, startTime: '18:30', discipline: 'hyrox' },
    });
    expect(res.status).toBe(201); // no bloquea
    const body = (await res.json()) as { details?: { overlaps: string[] } };
    expect(body.details?.overlaps).toEqual(['crossfit 18:00']);
  });

  it('sesión manual: se crea sin template y aparece en la grilla', async () => {
    const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await call('/api/v1/sessions', {
      method: 'POST',
      token: admin.token,
      body: { date, startTime: '10:00', durationMin: 45, discipline: 'open box', capacity: 8 },
    });
    expect(res.status).toBe(201);
    const { session } = (await res.json()) as { session: { id: string; templateId: string | null } };
    expect(session.templateId).toBeNull();

    const attendees = await call(`/api/v1/sessions/${session.id}/attendees`, { token: admin.token });
    expect(attendees.status).toBe(200);
    expect(((await attendees.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('attendees: devuelve los anotados con nombre', async () => {
    await createTemplate();
    const session = await classSessions().findOne({ orgId: orgA });
    if (!session) throw new Error('fixture: sin sesión');
    await fakeBooking(session._id, athlete.id);

    const res = await call(`/api/v1/sessions/${session._id.toHexString()}/attendees`, {
      token: admin.token,
    });
    const { items } = (await res.json()) as { items: { name: string; userId: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Atleta');
    expect(items[0]?.userId).toBe(athlete.id.toHexString());
  });
});
