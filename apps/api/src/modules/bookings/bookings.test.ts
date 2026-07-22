import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { bookings, classSessions, packAssignments } from '../../db/collections.js';
import { makeMembership, makeOrg, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

/**
 * Endpoints de reservas y saldo (F4-02). La lógica ya está probada en
 * `booking-service.test.ts`: acá se verifica el contrato HTTP — códigos,
 * formas de respuesta, orden y paginación.
 */

const config = testConfig();
const app = createApp(config);

const HOUR = 3_600_000;
const DAY = 86_400_000;

let orgA: ObjectId;
let athleteA: TestUser;
let athleteB: TestUser;

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

const errorCode = async (res: Response): Promise<string> =>
  ((await res.json()) as { error: { code: string } }).error.code;

async function makeSession(
  opts: { capacity?: number; startsInMs?: number; status?: 'scheduled' | 'cancelled' } = {},
): Promise<string> {
  const id = new ObjectId();
  const now = new Date();
  const startsAt = new Date(Date.now() + (opts.startsInMs ?? DAY));
  await classSessions().insertOne({
    _id: id,
    orgId: orgA,
    templateId: null,
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR),
    discipline: 'crossfit',
    capacity: opts.capacity ?? 10,
    bookedCount: 0,
    status: opts.status ?? 'scheduled',
    createdAt: now,
    updatedAt: now,
  });
  return id.toHexString();
}

async function makePack(
  userId: ObjectId,
  opts: { classCount?: number; used?: number; startsInMs?: number; expiresInMs?: number; name?: string } = {},
): Promise<ObjectId> {
  const id = new ObjectId();
  const now = new Date();
  const classCount = opts.classCount ?? 8;
  await packAssignments().insertOne({
    _id: id,
    orgId: orgA,
    userId,
    packId: new ObjectId(),
    snapshot: {
      name: opts.name ?? `Pack ${classCount}`,
      classCount,
      durationDays: 30,
      price: 25_000,
      currency: 'ARS',
      paymentMethod: 'cash',
    },
    startsAt: new Date(Date.now() + (opts.startsInMs ?? -DAY)),
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 30 * DAY)),
    classesUsed: opts.used ?? 0,
    status: 'active',
    payment: { amount: 25_000, method: 'cash', paidAt: now },
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

interface BookResponse {
  booking: { id: string; sessionId: string; status: string; bookedAt: string };
  session: { id: string; bookedCount: number; capacity: number };
  credits: { remaining: number; packName: string; expiresAt: string };
}

async function bookSession(user: TestUser, sessionId: string): Promise<BookResponse> {
  const res = await call('/api/v1/bookings', {
    method: 'POST',
    token: user.token,
    body: { sessionId },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as BookResponse;
}

describe('bookings API (F4-02)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Endpoints'); // cancellationWindowHours: 2
    athleteA = await makeUser(config, 'a@bkg.test', 'Ana');
    athleteB = await makeUser(config, 'b@bkg.test', 'Bruno');
    await makeMembership(orgA, athleteA.id, 'athlete');
    await makeMembership(orgA, athleteB.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    await Promise.all([
      bookings().deleteMany({}),
      classSessions().deleteMany({}),
      packAssignments().deleteMany({}),
    ]);
  });

  // ── 1. Camino feliz de cada endpoint ───────────────────────────────────────

  it('POST /bookings devuelve reserva, cupo y saldo en una sola respuesta', async () => {
    await makePack(athleteA.id, { classCount: 8, name: 'Pack 8 clases' });
    const sessionId = await makeSession({ capacity: 10 });

    const body = await bookSession(athleteA, sessionId);

    expect(body.booking.sessionId).toBe(sessionId);
    expect(body.booking.status).toBe('booked');
    expect(body.session).toEqual({ id: sessionId, bookedCount: 1, capacity: 10 });
    expect(body.credits.packName).toBe('Pack 8 clases');
    expect(body.credits.remaining).toBe(7);
  });

  it('POST /bookings/:id/cancel devuelve el crédito y el saldo nuevo', async () => {
    await makePack(athleteA.id, { classCount: 8 });
    const { booking } = await bookSession(athleteA, await makeSession());

    const res = await call(`/api/v1/bookings/${booking.id}/cancel`, {
      method: 'POST',
      token: athleteA.token,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, credits: { remaining: 8 } });
  });

  it('mapeo de errores del servicio de dominio', async () => {
    const [full, cancelada, pasada, libre] = await Promise.all([
      makeSession({ capacity: 1 }),
      makeSession({ status: 'cancelled' }),
      makeSession({ startsInMs: -HOUR }),
      makeSession(),
    ]);

    // sin pack todavía
    expect(await errorCode(await call('/api/v1/bookings', { method: 'POST', token: athleteA.token, body: { sessionId: libre } }))).toBe('NO_CREDITS');

    await makePack(athleteA.id, { classCount: 8 });
    await makePack(athleteB.id, { classCount: 8 });

    const cases: [string, string, number][] = [
      [cancelada, 'SESSION_CANCELLED', 409],
      [pasada, 'SESSION_STARTED', 409],
      [new ObjectId().toHexString(), 'NOT_FOUND', 404],
    ];
    for (const [sessionId, code, status] of cases) {
      const res = await call('/api/v1/bookings', { method: 'POST', token: athleteA.token, body: { sessionId } });
      expect(res.status).toBe(status);
      expect(await errorCode(res)).toBe(code);
    }

    // Sesión completa. Ojo: con `capacity: 1` el segundo intento del MISMO
    // atleta también da SESSION_FULL — el cupo se evalúa antes que el índice
    // único, así que el doble-tap se prueba con lugar de sobra.
    await bookSession(athleteA, full);
    expect(await errorCode(await call('/api/v1/bookings', { method: 'POST', token: athleteB.token, body: { sessionId: full } }))).toBe('SESSION_FULL');

    const conLugar = await makeSession({ capacity: 5 });
    await bookSession(athleteA, conLugar);
    expect(await errorCode(await call('/api/v1/bookings', { method: 'POST', token: athleteA.token, body: { sessionId: conLugar } }))).toBe('ALREADY_BOOKED');

    // ventana cerrada (RN-08): la clase empieza en 1 h y la org exige 2
    const yaEmpieza = await makeSession({ startsInMs: HOUR });
    const { booking } = await bookSession(athleteB, yaEmpieza);
    const cerrada = await call(`/api/v1/bookings/${booking.id}/cancel`, { method: 'POST', token: athleteB.token });
    expect(cerrada.status).toBe(409);
    const err = ((await cerrada.json()) as {
      error: { code: string; details?: { deadline?: string } };
    }).error;
    expect(err.code).toBe('CANCELLATION_WINDOW_CLOSED');
    // el FE necesita el instante límite para explicar el error, no solo el código
    expect(err.details?.deadline).toBeTypeOf('string');

    // validación de entrada
    const malFormado = await call('/api/v1/bookings', { method: 'POST', token: athleteA.token, body: { sessionId: 'no-es-un-id' } });
    expect(malFormado.status).toBe(400);
    expect(await errorCode(malFormado)).toBe('VALIDATION_ERROR');
  });

  // ── 2. Coherencia respuesta / DB ───────────────────────────────────────────

  it('credits.remaining coincide con lo que quedó en la base', async () => {
    const packId = await makePack(athleteA.id, { classCount: 3 });

    for (const expected of [2, 1, 0]) {
      const { credits } = await bookSession(athleteA, await makeSession());
      const doc = await packAssignments().findOne({ _id: packId });
      expect(credits.remaining).toBe(expected);
      expect((doc?.snapshot.classCount ?? 0) - (doc?.classesUsed ?? 0)).toBe(expected);
    }
    // agotado: el cuarto intento no encuentra crédito
    expect(await errorCode(await call('/api/v1/bookings', { method: 'POST', token: athleteA.token, body: { sessionId: await makeSession() } }))).toBe('NO_CREDITS');
  });

  // ── 3. Listado propio: particiones, orden y paginación ─────────────────────

  it('GET /me/bookings parte upcoming/history con el orden correcto', async () => {
    await makePack(athleteA.id, { classCount: 8 });
    const [s1, s2, s3] = await Promise.all([
      makeSession({ startsInMs: 3 * DAY }),
      makeSession({ startsInMs: DAY }),
      makeSession({ startsInMs: 2 * DAY }),
    ]);
    for (const id of [s1, s2, s3]) await bookSession(athleteA, id);

    // una cuarta reserva que se manda al pasado y otra cancelada → historial
    const vieja = await makeSession({ startsInMs: 2 * HOUR });
    const { booking: viejaBooking } = await bookSession(athleteA, vieja);
    await classSessions().updateOne(
      { _id: new ObjectId(vieja) },
      { $set: { startsAt: new Date(Date.now() - 5 * DAY) } },
    );
    const cancelada = await makeSession({ startsInMs: 4 * DAY });
    const { booking: canceladaBooking } = await bookSession(athleteA, cancelada);
    await call(`/api/v1/bookings/${canceladaBooking.id}/cancel`, { method: 'POST', token: athleteA.token });

    const up = (await (await call('/api/v1/me/bookings?scope=upcoming', { token: athleteA.token })).json()) as {
      items: { id: string; session: { id: string; startsAt: string } }[];
      nextCursor: string | null;
    };
    expect(up.items.map((b) => b.session.id)).toEqual([s2, s3, s1]); // asc por clase
    expect(up.nextCursor).toBeNull();

    const hist = (await (await call('/api/v1/me/bookings?scope=history', { token: athleteA.token })).json()) as {
      items: { id: string; status: string }[];
    };
    expect(hist.items.map((b) => b.id)).toEqual([canceladaBooking.id, viejaBooking.id]); // desc
    expect(hist.items[0]?.status).toBe('cancelled_by_user');
  });

  it('paginación estable con limit y nextCursor', async () => {
    await makePack(athleteA.id, { classCount: 8 });
    const ids = [];
    for (const days of [1, 2, 3]) ids.push(await makeSession({ startsInMs: days * DAY }));
    for (const id of ids) await bookSession(athleteA, id);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 3; i += 1) {
      const url = `/api/v1/me/bookings?scope=upcoming&limit=1${cursor ? `&after=${cursor}` : ''}`;
      const page = (await (await call(url, { token: athleteA.token })).json()) as {
        items: { session: { id: string } }[];
        nextCursor: string | null;
      };
      expect(page.items).toHaveLength(1);
      seen.push(page.items[0]?.session.id ?? '');
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(ids); // sin repetidos ni saltos
    expect(cursor).toBeNull();
  });

  // ── 4. Saldo ───────────────────────────────────────────────────────────────

  it('GET /me/credits ordena por consumo y suma solo lo usable ahora', async () => {
    const usable = await makePack(athleteA.id, { classCount: 8, used: 3, expiresInMs: 10 * DAY, name: 'Vence pronto' });
    const futuro = await makePack(athleteA.id, { classCount: 4, startsInMs: 5 * DAY, expiresInMs: 40 * DAY, name: 'Arranca el lunes' });
    const agotado = await makePack(athleteA.id, { classCount: 2, used: 2, expiresInMs: 20 * DAY, name: 'Agotado' });
    await packAssignments().updateOne({ _id: agotado }, { $set: { status: 'exhausted' } });

    const res = await call('/api/v1/me/credits', { token: athleteA.token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      packs: {
        id: string;
        name: string;
        remaining: number;
        total: number;
        status: string;
        expiresAt: string;
        usableFrom?: string;
      }[];
      totalRemaining: number;
      nextExpiration: string | null;
    };

    // usable primero (es el que consume FIFO), después el futuro, al final el terminado
    expect(body.packs.map((p) => p.id)).toEqual([
      usable.toHexString(),
      futuro.toHexString(),
      agotado.toHexString(),
    ]);
    expect(body.packs[0]).toMatchObject({ name: 'Vence pronto', remaining: 5, total: 8, status: 'active' });
    expect(body.packs[0]?.usableFrom).toBeUndefined();
    expect(body.packs[1]?.usableFrom).toBeTypeOf('string'); // "disponible desde…"
    expect(body.packs[2]?.status).toBe('exhausted');

    // 5 usables ahora: ni los 4 del futuro ni los 0 del agotado
    expect(body.totalRemaining).toBe(5);
    expect(body.nextExpiration).toBe(body.packs[0]?.expiresAt ?? null);
  });

  it('GET /me/credits marca vencido lo que el job todavía no barrió', async () => {
    const vencido = await makePack(athleteA.id, { classCount: 8, expiresInMs: -DAY }); // status 'active' en DB
    const body = (await (await call('/api/v1/me/credits', { token: athleteA.token })).json()) as {
      packs: { id: string; status: string }[];
      totalRemaining: number;
    };
    expect(body.packs.find((p) => p.id === vencido.toHexString())?.status).toBe('expired');
    expect(body.totalRemaining).toBe(0);
  });

  // ── 5. Aislamiento entre atletas ───────────────────────────────────────────

  it('un atleta no ve ni cancela las reservas de otro', async () => {
    await makePack(athleteA.id, { classCount: 8 });
    await makePack(athleteB.id, { classCount: 8 });
    const sessionId = await makeSession({ capacity: 5 });
    const { booking: deA } = await bookSession(athleteA, sessionId);
    await bookSession(athleteB, sessionId);

    const ajena = await call(`/api/v1/bookings/${deA.id}/cancel`, { method: 'POST', token: athleteB.token });
    expect(ajena.status).toBe(404);
    expect(await errorCode(ajena)).toBe('NOT_FOUND');
    // sigue en pie
    expect((await bookings().findOne({ _id: new ObjectId(deA.id) }))?.status).toBe('booked');

    const mias = (await (await call('/api/v1/me/bookings', { token: athleteB.token })).json()) as {
      items: { id: string }[];
    };
    expect(mias.items.map((b) => b.id)).not.toContain(deA.id);
    expect(mias.items).toHaveLength(1);
  });
});
