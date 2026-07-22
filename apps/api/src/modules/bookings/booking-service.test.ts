import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bookings,
  classSessions,
  organizations,
  packAssignments,
} from '../../db/collections.js';
import type { PackAssignmentStatus } from '@bv/contracts';
import { DomainError } from '../../lib/errors.js';
import { makeOrg } from '../../test/factories.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import {
  book,
  cancelByUser,
  cancelSessionByGym,
  cancellationDeadline,
  isCancellable,
} from './booking-service.js';
import type * as BookingsRepo from './bookings.repo.js';
import { insertBooking, refundCredit } from './bookings.repo.js';

/**
 * La suite más importante del proyecto (docs/08-testing.md §4): acá se prueba
 * que dos atletas nunca entren al mismo último cupo y que ningún crédito se
 * duplique ni se pierda. Todo corre contra Mongo real (replica set en memoria),
 * porque lo que se está probando es el comportamiento del servidor bajo
 * concurrencia — un mock no prueba nada de esto.
 *
 * El servicio no valida membresías (eso es del tenantGuard, F4-02), así que
 * los usuarios son ObjectId sueltos: la suite se enfoca en cupos y créditos.
 */

// Se envuelven las dos operaciones a las que la suite les inyecta fallos
// (rollback de la reserva y devolución fallida); el resto es el repo real.
vi.mock('./bookings.repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof BookingsRepo>();
  return {
    ...actual,
    insertBooking: vi.fn(actual.insertBooking),
    refundCredit: vi.fn(actual.refundCredit),
  };
});

const HOUR = 3_600_000;
const DAY = 86_400_000;

let orgA: ObjectId;
let orgB: ObjectId;

interface SessionOpts {
  orgId?: ObjectId;
  capacity?: number;
  startsInMs?: number;
  status?: 'scheduled' | 'cancelled';
}

async function makeSession(opts: SessionOpts = {}): Promise<ObjectId> {
  const id = new ObjectId();
  const now = new Date();
  const startsAt = new Date(Date.now() + (opts.startsInMs ?? DAY));
  await classSessions().insertOne({
    _id: id,
    orgId: opts.orgId ?? orgA,
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
  return id;
}

interface PackOpts {
  orgId?: ObjectId;
  classCount?: number;
  startsInMs?: number;
  expiresInMs?: number;
  status?: PackAssignmentStatus;
}

async function makePack(userId: ObjectId, opts: PackOpts = {}): Promise<ObjectId> {
  const id = new ObjectId();
  const now = new Date();
  const classCount = opts.classCount ?? 8;
  await packAssignments().insertOne({
    _id: id,
    orgId: opts.orgId ?? orgA,
    userId,
    packId: new ObjectId(),
    snapshot: {
      name: `Pack ${classCount}`,
      classCount,
      durationDays: 30,
      price: 25_000,
      currency: 'ARS',
      paymentMethod: 'cash',
    },
    startsAt: new Date(Date.now() + (opts.startsInMs ?? -DAY)),
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 30 * DAY)),
    classesUsed: 0,
    status: opts.status ?? 'active',
    payment: { amount: 25_000, method: 'cash', paidAt: now },
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Corre la operación y devuelve `'OK'` o el código de dominio que falló. */
async function codeOf(op: Promise<unknown>): Promise<string> {
  try {
    await op;
    return 'OK';
  } catch (err) {
    if (err instanceof DomainError) return err.code;
    throw err;
  }
}

const seatsOf = async (sessionId: ObjectId): Promise<number> =>
  (await classSessions().findOne({ _id: sessionId }))?.bookedCount ?? -1;

const usedOf = async (packId: ObjectId): Promise<number> =>
  (await packAssignments().findOne({ _id: packId }))?.classesUsed ?? -1;

const statusOf = async (packId: ObjectId): Promise<string> =>
  (await packAssignments().findOne({ _id: packId }))?.status ?? 'missing';

/** Invariante global: los contadores denormalizados (DEC-08) no mienten. */
async function expectCountersConsistent(sessionId: ObjectId): Promise<void> {
  const session = await classSessions().findOne({ _id: sessionId });
  if (!session) throw new Error('fixture: sin sesión');
  const active = await bookings().countDocuments({ sessionId, status: 'booked' });
  expect(session.bookedCount).toBe(active);
  expect(session.bookedCount).toBeGreaterThanOrEqual(0);
  expect(session.bookedCount).toBeLessThanOrEqual(session.capacity);

  for (const pack of await packAssignments().find({}).toArray()) {
    const spent = await bookings().countDocuments({
      packAssignmentId: pack._id,
      status: 'booked',
    });
    expect(pack.classesUsed).toBe(spent);
  }
}

describe('booking-service (F4-01)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Reservas'); // cancellationWindowHours: 2
    orgB = await makeOrg('Box Ajeno');
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    await Promise.all([
      bookings().deleteMany({}),
      classSessions().deleteMany({}),
      packAssignments().deleteMany({}),
    ]);
    await organizations().updateOne(
      { _id: orgA },
      { $set: { 'settings.cancellationWindowHours': 2 } },
    );
  });

  // ── Concurrencia: los 6 canónicos ──────────────────────────────────────────

  it('caso 1: dos atletas al último cupo → uno entra, el otro SESSION_FULL', async () => {
    const sessionId = await makeSession({ capacity: 1 });
    const [userA, userB] = [new ObjectId(), new ObjectId()];
    await Promise.all([makePack(userA), makePack(userB)]);

    const results = await Promise.all([
      codeOf(book(userA, orgA, sessionId)),
      codeOf(book(userB, orgA, sessionId)),
    ]);

    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r === 'SESSION_FULL')).toHaveLength(1);
    expect(await seatsOf(sessionId)).toBe(1);
    expect(await bookings().countDocuments({ sessionId, status: 'booked' })).toBe(1);
    await expectCountersConsistent(sessionId);
  });

  it('caso 2: un solo crédito y dos clases a la vez → uno entra, el otro NO_CREDITS', async () => {
    const [s1, s2] = await Promise.all([makeSession(), makeSession()]);
    const user = new ObjectId();
    const packId = await makePack(user, { classCount: 1 });

    const results = await Promise.all([
      codeOf(book(user, orgA, s1)),
      codeOf(book(user, orgA, s2)),
    ]);

    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r === 'NO_CREDITS')).toHaveLength(1);
    expect(await usedOf(packId)).toBe(1);
    expect(await bookings().countDocuments({ status: 'booked' })).toBe(1);
    // La sesión que perdió no quedó con el cupo tomado.
    expect((await seatsOf(s1)) + (await seatsOf(s2))).toBe(1);
  });

  it('caso 3: doble-tap del mismo atleta → una reserva, ALREADY_BOOKED, contadores en 1', async () => {
    const sessionId = await makeSession({ capacity: 5 });
    const user = new ObjectId();
    const packId = await makePack(user);

    const results = await Promise.all([
      codeOf(book(user, orgA, sessionId)),
      codeOf(book(user, orgA, sessionId)),
    ]);

    expect(results.filter((r) => r === 'OK')).toHaveLength(1);
    expect(results.filter((r) => r === 'ALREADY_BOOKED')).toHaveLength(1);
    // El rollback de la transacción perdedora no deja el cupo ni el crédito inflados.
    expect(await seatsOf(sessionId)).toBe(1);
    expect(await usedOf(packId)).toBe(1);
    await expectCountersConsistent(sessionId);
  });

  it('caso 4: fallo en el insert → rollback completo de cupo y crédito', async () => {
    const sessionId = await makeSession({ capacity: 5 });
    const user = new ObjectId();
    const packId = await makePack(user);

    vi.mocked(insertBooking).mockRejectedValueOnce(new Error('fallo inyectado'));

    await expect(book(user, orgA, sessionId)).rejects.toThrow('fallo inyectado');
    expect(await seatsOf(sessionId)).toBe(0);
    expect(await usedOf(packId)).toBe(0);
    expect(await bookings().countDocuments({})).toBe(0);
  });

  it('caso 5: cancelar y reservar el último cupo a la vez (20 iteraciones)', async () => {
    const [userA, userB] = [new ObjectId(), new ObjectId()];
    await Promise.all([
      makePack(userA, { classCount: 40 }),
      makePack(userB, { classCount: 40 }),
    ]);

    for (let i = 0; i < 20; i += 1) {
      await bookings().deleteMany({});
      await packAssignments().updateMany({}, { $set: { classesUsed: 0, status: 'active' } });
      const sessionId = await makeSession({ capacity: 1 });

      const { booking } = await book(userA, orgA, sessionId);
      const [cancelled, booked] = await Promise.all([
        codeOf(cancelByUser(userA, orgA, booking._id)),
        codeOf(book(userB, orgA, sessionId)),
      ]);

      expect(cancelled).toBe('OK'); // la ventana está abierta: siempre puede
      expect(['OK', 'SESSION_FULL']).toContain(booked);
      await expectCountersConsistent(sessionId);
    }
  }, 60_000);

  it('caso 6: 20 reservas concurrentes a 10 cupos → 10 y 10, contadores exactos', async () => {
    const sessionId = await makeSession({ capacity: 10 });
    const users = Array.from({ length: 20 }, () => new ObjectId());
    await Promise.all(users.map((u) => makePack(u, { classCount: 1 })));

    const results = await Promise.all(users.map((u) => codeOf(book(u, orgA, sessionId))));

    expect(results.filter((r) => r === 'OK')).toHaveLength(10);
    expect(results.filter((r) => r === 'SESSION_FULL')).toHaveLength(10);
    expect(await seatsOf(sessionId)).toBe(10);
    expect(await packAssignments().countDocuments({ classesUsed: 1 })).toBe(10);
    await expectCountersConsistent(sessionId);
  }, 60_000);

  // ── FIFO y estados del pack ────────────────────────────────────────────────

  it('caso 7: consume primero el pack que vence antes (RN-12)', async () => {
    const user = new ObjectId();
    const packA = await makePack(user, { classCount: 1, expiresInMs: 5 * DAY });
    const packB = await makePack(user, { classCount: 2, expiresInMs: 20 * DAY });

    const first = await book(user, orgA, await makeSession());
    expect(first.assignment._id.toHexString()).toBe(packA.toHexString());
    expect(first.assignment.status).toBe('exhausted');

    const second = await book(user, orgA, await makeSession());
    expect(second.assignment._id.toHexString()).toBe(packB.toHexString());
    expect(await usedOf(packB)).toBe(1);
  });

  it('caso 8: el último crédito deja el pack exhausted en el MISMO update (RN-13)', async () => {
    const user = new ObjectId();
    const packId = await makePack(user, { classCount: 1 });

    const { assignment } = await book(user, orgA, await makeSession());

    // El documento que devuelve la transacción ya es el post-update: nunca se
    // observa `active` con el crédito consumido.
    expect(assignment.status).toBe('exhausted');
    expect(assignment.classesUsed).toBe(assignment.snapshot.classCount);
    expect(await statusOf(packId)).toBe('exhausted');
  });

  it('caso 9: la devolución repara exhausted vigente, pero no resucita un vencido', async () => {
    const user = new ObjectId();

    const vigente = await makePack(user, { classCount: 1 });
    const b1 = await book(user, orgA, await makeSession({ startsInMs: 3 * HOUR }));
    expect(await statusOf(vigente)).toBe('exhausted');
    await cancelByUser(user, orgA, b1.booking._id);
    expect(await statusOf(vigente)).toBe('active');
    expect(await usedOf(vigente)).toBe(0);

    // Vencido después de reservar: el crédito vuelve pero sigue inutilizable (RN-08).
    await packAssignments().updateOne({ _id: vigente }, { $set: { status: 'cancelled' } });
    const otro = await makePack(user, { classCount: 1 });
    const b2 = await book(user, orgA, await makeSession({ startsInMs: 3 * HOUR }));
    await packAssignments().updateOne(
      { _id: otro },
      { $set: { status: 'expired', expiresAt: new Date(Date.now() - DAY) } },
    );
    await cancelByUser(user, orgA, b2.booking._id);
    expect(await statusOf(otro)).toBe('expired');
    expect(await usedOf(otro)).toBe(0);
  });

  it('caso 10: un pack que arranca mañana todavía no da crédito', async () => {
    const user = new ObjectId();
    await makePack(user, { startsInMs: DAY });

    expect(await codeOf(book(user, orgA, await makeSession()))).toBe('NO_CREDITS');
  });

  // ── Ventana de cancelación (RN-08) ─────────────────────────────────────────

  it('caso 11: ventana de 2 h — 2h01 cancela, 1h59 no', async () => {
    const user = new ObjectId();
    await makePack(user, { classCount: 8 });

    const abierta = await book(user, orgA, await makeSession({ startsInMs: 2 * HOUR + 60_000 }));
    expect(await codeOf(cancelByUser(user, orgA, abierta.booking._id))).toBe('OK');

    const cerrada = await book(user, orgA, await makeSession({ startsInMs: 2 * HOUR - 60_000 }));
    expect(await codeOf(cancelByUser(user, orgA, cerrada.booking._id))).toBe(
      'CANCELLATION_WINDOW_CLOSED',
    );
    // La reserva sigue en pie: el abort deshizo la marca de cancelación.
    const still = await bookings().findOne({ _id: cerrada.booking._id });
    expect(still?.status).toBe('booked');
    expect(await seatsOf(cerrada.session._id)).toBe(1);
  });

  it('caso 11b: justo en el límite se permite (regla `>=`)', () => {
    // El borde exacto no se puede provocar con el reloj real sin flakear: la
    // regla es una función pura y se prueba como tal.
    const startsAt = new Date('2026-07-21T20:00:00.000Z');
    const deadline = cancellationDeadline(startsAt, 2);
    expect(deadline.toISOString()).toBe('2026-07-21T18:00:00.000Z');
    expect(isCancellable(deadline, startsAt, 2)).toBe(true);
    expect(isCancellable(new Date(deadline.getTime() - 1), startsAt, 2)).toBe(true);
    expect(isCancellable(new Date(deadline.getTime() + 1), startsAt, 2)).toBe(false);
    // Ventana 0: hasta el instante de arranque.
    expect(isCancellable(startsAt, startsAt, 0)).toBe(true);
    expect(isCancellable(new Date(startsAt.getTime() + 1), startsAt, 0)).toBe(false);
  });

  it('caso 12: ventana 0 → se cancela hasta que la clase empieza', async () => {
    await organizations().updateOne(
      { _id: orgA },
      { $set: { 'settings.cancellationWindowHours': 0 } },
    );
    const user = new ObjectId();
    await makePack(user);

    const { booking } = await book(user, orgA, await makeSession({ startsInMs: 3_000 }));
    expect(await codeOf(cancelByUser(user, orgA, booking._id))).toBe('OK');
  });

  // ── Cancelación por el gimnasio (RN-09) ────────────────────────────────────

  it('caso 13: el gym cancela y devuelve todo, incluso fuera de ventana; re-invocar es no-op', async () => {
    // Una de las tres está dentro de la ventana cerrada: el gym la devuelve igual.
    const sessionId = await makeSession({ capacity: 5, startsInMs: 30 * 60_000 });
    const users = [new ObjectId(), new ObjectId(), new ObjectId()];
    const packIds = await Promise.all(users.map((u) => makePack(u, { classCount: 1 })));
    for (const user of users) await book(user, orgA, sessionId);
    expect(await seatsOf(sessionId)).toBe(3);

    const actor = new ObjectId();
    const first = await cancelSessionByGym(orgA, sessionId, actor);
    expect(first.cancelled).toBe(3);
    expect(first.failed).toBe(0);
    expect(first.session.status).toBe('cancelled');
    expect(first.session.bookedCount).toBe(0);
    expect(await bookings().countDocuments({ status: 'cancelled_by_gym' })).toBe(3);
    for (const packId of packIds) {
      expect(await usedOf(packId)).toBe(0);
      expect(await statusOf(packId)).toBe('active'); // volvieron de exhausted
    }

    const again = await cancelSessionByGym(orgA, sessionId, actor);
    expect(again.cancelled).toBe(0);
    expect(again.failed).toBe(0);
    expect(await seatsOf(sessionId)).toBe(0);
  });

  it('caso 13b: una devolución que falla no frena a las demás y se reporta', async () => {
    const sessionId = await makeSession({ capacity: 5 });
    const users = [new ObjectId(), new ObjectId()];
    await Promise.all(users.map((u) => makePack(u, { classCount: 1 })));
    for (const user of users) await book(user, orgA, sessionId);

    vi.mocked(refundCredit).mockRejectedValueOnce(new Error('mongo caído'));
    const result = await cancelSessionByGym(orgA, sessionId, new ObjectId());

    expect(result.cancelled).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.session.status).toBe('cancelled');
    // La reserva que falló quedó intacta (rollback), no a medio cancelar.
    expect(await bookings().countDocuments({ sessionId, status: 'booked' })).toBe(1);
    expect(await seatsOf(sessionId)).toBe(1);

    // Reintentar la operación completa termina el trabajo: es idempotente.
    const retry = await cancelSessionByGym(orgA, sessionId, new ObjectId());
    expect(retry.cancelled).toBe(1);
    expect(retry.failed).toBe(0);
    await expectCountersConsistent(sessionId);
  });

  // ── Reservas inválidas ─────────────────────────────────────────────────────

  it('caso 14: sesión pasada, cancelada, de otra org o inexistente', async () => {
    const user = new ObjectId();
    await makePack(user, { classCount: 8 });

    const pasada = await makeSession({ startsInMs: -HOUR });
    const cancelada = await makeSession({ status: 'cancelled' });
    const ajena = await makeSession({ orgId: orgB });

    expect(await codeOf(book(user, orgA, pasada))).toBe('SESSION_STARTED');
    expect(await codeOf(book(user, orgA, cancelada))).toBe('SESSION_CANCELLED');
    expect(await codeOf(book(user, orgA, ajena))).toBe('NOT_FOUND');
    expect(await codeOf(book(user, orgA, new ObjectId()))).toBe('NOT_FOUND');
    // Ningún intento fallido consumió crédito.
    expect(await packAssignments().countDocuments({ classesUsed: { $gt: 0 } })).toBe(0);
  });

  it('cancelar una reserva ajena o ya cancelada → NOT_FOUND', async () => {
    const user = new ObjectId();
    await makePack(user);
    const { booking } = await book(user, orgA, await makeSession());

    expect(await codeOf(cancelByUser(new ObjectId(), orgA, booking._id))).toBe('NOT_FOUND');
    expect(await codeOf(cancelByUser(user, orgB, booking._id))).toBe('NOT_FOUND');
    expect(await codeOf(cancelByUser(user, orgA, booking._id))).toBe('OK');
    expect(await codeOf(cancelByUser(user, orgA, booking._id))).toBe('NOT_FOUND');
  });

  it('cancelar una sesión inexistente → NOT_FOUND', async () => {
    await expect(cancelSessionByGym(orgA, new ObjectId(), new ObjectId())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
