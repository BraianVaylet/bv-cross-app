import { ObjectId } from 'mongodb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardDto } from '@bv/contracts';
import { createApp } from '../../app.js';
import {
  bookings,
  classSessions,
  memberships,
  packAssignments,
} from '../../db/collections.js';
import { issueAccessToken } from '../auth/token-service.js';
import { makeMembership, makeOrg, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

/**
 * Dashboard del CRM (F3-10).
 *
 * El reloj está congelado y los números esperados están **calculados a mano**
 * en cada caso: si el test sacara los totales del mismo código que prueba,
 * confirmaría que el código hace lo que hace, no que hace lo que debe.
 *
 * El congelado es al mediodía UTC de un miércoles: en `America/Argentina/
 * Buenos_Aires` (UTC-3) son las 09:00 del mismo día, así que la fecha local y
 * la UTC coinciden y los casos de frontera se ven solos.
 */

const config = testConfig();
const app = createApp(config);

const AHORA = new Date('2026-07-15T12:00:00.000Z'); // miércoles 15/07, 09:00 AR

let orgA: ObjectId;
let admin: TestUser;

async function get(): Promise<DashboardDto> {
  const res = await app.request('/api/v1/stats/dashboard', {
    headers: { authorization: `Bearer ${admin.token}`, 'x-org-id': orgA.toHexString() },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { dashboard: DashboardDto }).dashboard;
}

async function addAssignment(
  userId: ObjectId,
  amount: number,
  createdAt: Date,
  over: { status?: 'active' | 'cancelled' | 'expired'; expiresAt?: Date; classesUsed?: number } = {},
): Promise<ObjectId> {
  const id = new ObjectId();
  await packAssignments().insertOne({
    _id: id,
    orgId: orgA,
    userId,
    packId: new ObjectId(),
    snapshot: {
      name: 'Pack 8',
      classCount: 8,
      durationDays: 30,
      price: amount,
      currency: 'ARS',
      paymentMethod: 'cash',
    },
    startsAt: createdAt,
    expiresAt: over.expiresAt ?? new Date('2026-12-31T00:00:00.000Z'),
    classesUsed: over.classesUsed ?? 0,
    status: over.status ?? 'active',
    payment: { amount, method: 'cash', paidAt: createdAt },
    createdAt,
    updatedAt: createdAt,
  });
  return id;
}

async function addBooking(userId: ObjectId, bookedAt: Date, cancelledAt?: Date): Promise<void> {
  await bookings().insertOne({
    _id: new ObjectId(),
    orgId: orgA,
    sessionId: new ObjectId(),
    userId,
    packAssignmentId: new ObjectId(),
    status: cancelledAt ? 'cancelled_by_user' : 'booked',
    bookedAt,
    ...(cancelledAt ? { cancelledAt } : {}),
  });
}

async function addSession(startsAt: Date, discipline: string, booked: number): Promise<void> {
  await classSessions().insertOne({
    _id: new ObjectId(),
    orgId: orgA,
    templateId: null,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3_600_000),
    discipline,
    capacity: 12,
    bookedCount: booked,
    status: 'scheduled',
    createdAt: AHORA,
    updatedAt: AHORA,
  });
}

describe('dashboard del CRM (F3-10)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Dashboard');
    admin = await makeUser(config, 'admin@dash.test', 'Admin');
    const adminId = await makeMembership(orgA, admin.id, 'admin');
    // El alta del admin es de hace años: si quedara con la fecha real de la
    // corrida contaría como alta del mes y ensuciaría los números a mano.
    await memberships().updateOne(
      { _id: adminId },
      { $set: { joinedAt: new Date('2020-01-01T00:00:00.000Z') } },
    );
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    // Solo `Date`: los timers reales los necesita el driver de Mongo.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    // El token se firma DESPUÉS de mover el reloj: uno emitido con la hora
    // real quedaría con `iat` en el futuro y la API lo rechazaría con 401.
    admin.token = await issueAccessToken(admin.id.toHexString(), config);
    await Promise.all([
      packAssignments().deleteMany({ orgId: orgA }),
      bookings().deleteMany({ orgId: orgA }),
      classSessions().deleteMany({ orgId: orgA }),
      memberships().deleteMany({ orgId: orgA, role: 'athlete' }),
    ]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('las ventanas del período salen en la tz de la org, no en UTC', async () => {
    const dash = await get();
    expect(dash.today.date).toBe('2026-07-15');
    expect(dash.week).toMatchObject({ from: '2026-07-13', to: '2026-07-19' }); // lun–dom
    expect(dash.month).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('el facturado del mes suma lo cobrado y deja afuera lo de otro mes', async () => {
    const ana = await makeUser(config, 'ana@dash.test', 'Ana');
    // 25.000 + 32.000 + 20.000 = 77.000 en julio.
    await addAssignment(ana.id, 25_000, new Date('2026-07-02T14:00:00.000Z'));
    await addAssignment(ana.id, 32_000, new Date('2026-07-10T14:00:00.000Z'));
    await addAssignment(ana.id, 20_000, new Date('2026-07-15T11:00:00.000Z'));
    // Junio: fuera de la ventana.
    await addAssignment(ana.id, 99_000, new Date('2026-06-20T14:00:00.000Z'));
    // Cancelada: se devolvió la plata, no facturó.
    await addAssignment(ana.id, 50_000, new Date('2026-07-05T14:00:00.000Z'), {
      status: 'cancelled',
    });

    expect((await get()).month.revenue).toBe(77_000);
  });

  it('la frontera de mes se corta en la tz de la org (RN de timezone)', async () => {
    const ana = await makeUser(config, 'frontera@dash.test', 'Frontera');
    // 01/07 02:00 UTC = 30/06 23:00 AR → es JUNIO para el gimnasio.
    await addAssignment(ana.id, 11_000, new Date('2026-07-01T02:00:00.000Z'));
    // 01/08 02:00 UTC = 31/07 23:00 AR → todavía es JULIO para el gimnasio.
    await addAssignment(ana.id, 13_000, new Date('2026-08-01T02:00:00.000Z'));

    // Si el corte fuera en UTC daría 11.000; en la tz de la org da 13.000.
    expect((await get()).month.revenue).toBe(13_000);
  });

  it('las altas del mes cuentan por joinedAt', async () => {
    const nuevo = await makeUser(config, 'nuevo@dash.test', 'Nuevo');
    const viejo = await makeUser(config, 'viejo@dash.test', 'Viejo');
    const id = await makeMembership(orgA, nuevo.id, 'athlete');
    const otro = await makeMembership(orgA, viejo.id, 'athlete');
    await memberships().updateOne(
      { _id: id },
      { $set: { joinedAt: new Date('2026-07-09T14:00:00.000Z') } },
    );
    await memberships().updateOne(
      { _id: otro },
      { $set: { joinedAt: new Date('2026-03-09T14:00:00.000Z') } },
    );

    expect((await get()).month.newMembers).toBe(1);
  });

  it('vence en 6 días aparece; en 8 no; ya vencida tampoco', async () => {
    const ana = await makeUser(config, 'vence@dash.test', 'Ana Vence');
    await makeMembership(orgA, ana.id, 'athlete');
    await addAssignment(ana.id, 25_000, AHORA, {
      expiresAt: new Date('2026-07-21T23:59:59.000Z'), // +6 días
      classesUsed: 3,
    });
    await addAssignment(ana.id, 25_000, AHORA, {
      expiresAt: new Date('2026-07-23T23:59:59.000Z'), // +8 días
    });
    await addAssignment(ana.id, 25_000, AHORA, {
      expiresAt: new Date('2026-07-10T23:59:59.000Z'), // ya venció
    });
    // Un pack agotado que "vence" pronto no es una venta por renovar.
    await addAssignment(ana.id, 25_000, AHORA, {
      status: 'expired',
      expiresAt: new Date('2026-07-19T23:59:59.000Z'),
    });

    const { expiringAssignments: lista } = await get();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ memberName: 'Ana Vence', daysLeft: 6, remaining: 5 });
  });

  it('las clases de hoy salen con su ocupación y en orden', async () => {
    await addSession(new Date('2026-07-15T22:00:00.000Z'), 'crossfit', 8); // 19:00 AR
    await addSession(new Date('2026-07-15T12:30:00.000Z'), 'hyrox', 3); // 09:30 AR
    await addSession(new Date('2026-07-16T12:30:00.000Z'), 'crossfit', 5); // mañana
    // 15/07 02:00 UTC = 14/07 23:00 AR: ayer para el gimnasio, aunque en UTC sea hoy.
    await addSession(new Date('2026-07-15T02:00:00.000Z'), 'crossfit', 9);

    const { today } = await get();
    expect(today.sessions.map((s) => [s.discipline, s.bookedCount])).toEqual([
      ['hyrox', 3],
      ['crossfit', 8],
    ]);
    expect(today.sessions[0]?.capacity).toBe(12);
  });

  it('la semana cuenta reservas y cancelaciones por cuándo pasaron', async () => {
    const ana = await makeUser(config, 'semana@dash.test', 'Semana');
    await addBooking(ana.id, new Date('2026-07-13T14:00:00.000Z')); // lunes
    await addBooking(ana.id, new Date('2026-07-14T14:00:00.000Z')); // martes
    // Reservada el lunes y cancelada el miércoles: suma en las dos columnas.
    await addBooking(
      ana.id,
      new Date('2026-07-13T15:00:00.000Z'),
      new Date('2026-07-15T10:00:00.000Z'),
    );
    // Semana pasada: afuera de las dos.
    await addBooking(ana.id, new Date('2026-07-06T14:00:00.000Z'));

    expect((await get()).week).toMatchObject({ bookings: 3, cancellations: 1 });
  });

  it('los inactivos son los que hace 14+ días no reservan', async () => {
    const activa = await makeUser(config, 'activa@dash.test', 'Activa');
    const ausente = await makeUser(config, 'ausente@dash.test', 'Ausente');
    const nunca = await makeUser(config, 'nunca@dash.test', 'Nunca Vino');
    await makeMembership(orgA, activa.id, 'athlete');
    await makeMembership(orgA, ausente.id, 'athlete');
    const idNunca = await makeMembership(orgA, nunca.id, 'athlete');
    // Se anotó hace 20 días y no reservó nunca: es el que hay que llamar.
    await memberships().updateOne(
      { _id: idNunca },
      { $set: { joinedAt: new Date('2026-06-25T14:00:00.000Z') } },
    );

    await addBooking(activa.id, new Date('2026-07-14T14:00:00.000Z')); // ayer
    await addBooking(ausente.id, new Date('2026-06-20T14:00:00.000Z')); // hace 25 días

    const { inactiveMembers: lista } = await get();
    expect(lista.map((m) => m.memberName).sort()).toEqual(['Ausente', 'Nunca Vino']);
    expect(lista.find((m) => m.memberName === 'Ausente')?.daysInactive).toBe(25);
    expect(lista.find((m) => m.memberName === 'Nunca Vino')?.lastBookingAt).toBeNull();
  });

  it('el atleta no ve el dashboard del gimnasio', async () => {
    const atleta = await makeUser(config, 'atleta@dash.test', 'Atleta');
    await makeMembership(orgA, atleta.id, 'athlete');
    const res = await app.request('/api/v1/stats/dashboard', {
      headers: { authorization: `Bearer ${atleta.token}`, 'x-org-id': orgA.toHexString() },
    });
    expect(res.status).toBe(403);
  });

  it('gimnasio recién abierto: todo en cero, sin romper', async () => {
    const dash = await get();
    expect(dash.today.sessions).toEqual([]);
    expect(dash.expiringAssignments).toEqual([]);
    expect(dash.inactiveMembers).toEqual([]);
    expect(dash.month).toMatchObject({ revenue: 0, newMembers: 0 });
    expect(dash.week).toMatchObject({ bookings: 0, cancellations: 0 });
  });
});
