import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { memberships, packAssignments, packs } from '../../db/collections.js';
import { expirePacksJob } from '../../jobs/expire-packs.js';
import { makeMembership, makeOrg, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

const config = testConfig();
const app = createApp(config);

let orgA: ObjectId;
let admin: TestUser;
let athleteA: TestUser;
let athleteB: TestUser;
let membershipA: ObjectId;
let membershipB: ObjectId;

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

const PACK = {
  name: 'Pack 8 clases',
  classCount: 8,
  durationDays: 30,
  price: 25_000,
  paymentMethod: 'cash' as const,
};

async function createPack(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await call('/api/v1/packs', {
    method: 'POST',
    token: admin.token,
    body: { ...PACK, ...overrides },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { pack: { id: string } }).pack.id;
}

interface AssignmentShape {
  id: string;
  snapshot: { name: string; price: number; classCount: number; durationDays: number };
  startsAt: string;
  expiresAt: string;
  remaining: number;
  status: string;
  payment: { amount: number; method: string; paidAt: string };
}

async function assign(
  membershipId: ObjectId,
  body: Record<string, unknown>,
): Promise<{ res: Response; assignment?: AssignmentShape }> {
  const res = await call(`/api/v1/members/${membershipId.toHexString()}/assignments`, {
    method: 'POST',
    token: admin.token,
    body,
  });
  if (res.status !== 201) return { res };
  const { assignment } = (await res.json()) as { assignment: AssignmentShape };
  return { res, assignment };
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('assignments (F3-03)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Packs'); // tz America/Argentina/Buenos_Aires
    admin = await makeUser(config, 'admin@asg.test', 'Admin');
    athleteA = await makeUser(config, 'a@asg.test', 'Atleta A');
    athleteB = await makeUser(config, 'b@asg.test', 'Atleta B');
    await makeMembership(orgA, admin.id, 'admin');
    membershipA = await makeMembership(orgA, athleteA.id, 'athlete');
    membershipB = await makeMembership(orgA, athleteB.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    await Promise.all([packs().deleteMany({}), packAssignments().deleteMany({})]);
  });

  it('caso 1: defaults — amount = precio del snapshot, paidAt ≈ ahora, activo', async () => {
    const packId = await createPack();
    const before = Date.now();
    const { assignment } = await assign(membershipA, { packId });
    if (!assignment) throw new Error('no se creó');

    expect(assignment.snapshot).toEqual({
      name: PACK.name,
      classCount: 8,
      durationDays: 30,
      price: 25_000,
      currency: 'ARS',
      paymentMethod: 'cash',
    });
    expect(assignment.payment.amount).toBe(25_000);
    expect(assignment.payment.method).toBe('cash');
    expect(Date.parse(assignment.payment.paidAt)).toBeGreaterThanOrEqual(before);
    expect(assignment.status).toBe('active');
    expect(assignment.remaining).toBe(8); // classCount - classesUsed
  });

  it('caso 3: expiresAt es fin del día en tz de la org (UTC calculado a mano)', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, { packId, startsAt: '2026-07-01' });
    if (!assignment) throw new Error('no se creó');

    // 2026-07-01 + 30 días = 2026-07-31. Fin de ese día en AR (UTC-3) es
    // 2026-07-31T23:59:59.999-03:00; en UTC eso es 2026-08-01T02:59:59.999Z.
    expect(assignment.expiresAt).toBe('2026-08-01T02:59:59.999Z');
  });

  it('caso 4: cruce de año — 15/12 + 30 días vence el 14/01 fin de día AR', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, { packId, startsAt: '2026-12-15' });
    if (!assignment) throw new Error('no se creó');

    // 2026-12-15 + 30 = 2027-01-14 → 23:59:59.999-03:00 = 2027-01-15T02:59:59.999Z
    expect(assignment.expiresAt).toBe('2027-01-15T02:59:59.999Z');
  });

  it('caso 2: el snapshot es inmutable — editar o archivar el pack no lo toca', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, { packId });
    if (!assignment) throw new Error('no se creó');
    const original = await packAssignments().findOne({ _id: new ObjectId(assignment.id) });

    // name se puede editar aun con asignación activa (matriz RN-14)
    await call(`/api/v1/packs/${packId}`, {
      method: 'PATCH',
      token: admin.token,
      body: { name: 'Pack renombrado' },
    });
    await call(`/api/v1/packs/${packId}/archive`, { method: 'POST', token: admin.token });

    const after = await packAssignments().findOne({ _id: new ObjectId(assignment.id) });
    expect(after?.snapshot).toEqual(original?.snapshot);
    expect(after?.snapshot.name).toBe(PACK.name); // el viejo, no "Pack renombrado"
  });

  it('caso 5: payment.amount menor al precio registra el descuento', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, {
      packId,
      payment: { amount: 20_000, notes: 'descuento amigo' },
    });
    if (!assignment) throw new Error('no se creó');

    expect(assignment.payment.amount).toBe(20_000);
    expect(assignment.snapshot.price).toBe(25_000); // el precio de lista no cambia
  });

  it('caso 6: pack archivado → PACK_ARCHIVED; miembro disabled → MEMBER_DISABLED; invited → OK', async () => {
    const packId = await createPack();
    await call(`/api/v1/packs/${packId}/archive`, { method: 'POST', token: admin.token });
    const archived = await assign(membershipA, { packId });
    expect(archived.res.status).toBe(409);
    expect(await errorCode(archived.res)).toBe('PACK_ARCHIVED');

    const freshPack = await createPack({ name: 'Pack activo' });
    await memberships().updateOne({ _id: membershipB }, { $set: { status: 'disabled' } });
    const disabled = await assign(membershipB, { packId: freshPack });
    expect(disabled.res.status).toBe(409);
    expect(await errorCode(disabled.res)).toBe('MEMBER_DISABLED');
    await memberships().updateOne({ _id: membershipB }, { $set: { status: 'active' } });

    // invited con cuenta vinculada sí puede recibir pack (el gym carga antes)
    await memberships().updateOne({ _id: membershipB }, { $set: { status: 'invited' } });
    const invited = await assign(membershipB, { packId: freshPack });
    expect(invited.res.status).toBe(201);
    await memberships().updateOne({ _id: membershipB }, { $set: { status: 'active' } });
  });

  it('caso 7: RN-17 permite varios activos solapados; el historial viene ordenado', async () => {
    const packId = await createPack();
    const first = await assign(membershipA, { packId });
    const second = await assign(membershipA, { packId });
    expect(first.res.status).toBe(201);
    expect(second.res.status).toBe(201);

    const res = await call('/api/v1/me/assignments', { token: athleteA.token });
    const { items } = (await res.json()) as { items: { id: string; status: string }[] };
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === 'active')).toBe(true);
    // createdAt desc: la última creada primero
    expect(items[0]?.id).toBe(second.assignment?.id);
  });

  it('caso 8: cancel feliz; cancelar una terminal o repetir → 409', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, { packId });
    if (!assignment) throw new Error('no se creó');

    const ok = await call(`/api/v1/assignments/${assignment.id}/cancel`, {
      method: 'POST',
      token: admin.token,
      body: { reason: 'se dio de baja' },
    });
    expect(ok.status).toBe(200);
    const cancelled = (await ok.json()) as { assignment: { status: string; cancelledReason?: string } };
    expect(cancelled.assignment.status).toBe('cancelled');
    expect(cancelled.assignment.cancelledReason).toBe('se dio de baja');

    // doble cancel
    const again = await call(`/api/v1/assignments/${assignment.id}/cancel`, {
      method: 'POST',
      token: admin.token,
      body: { reason: 'otra vez' },
    });
    expect(again.status).toBe(400);

    // terminal (expired) tampoco
    const other = await assign(membershipA, { packId });
    if (!other.assignment) throw new Error('no se creó');
    await packAssignments().updateOne(
      { _id: new ObjectId(other.assignment.id) },
      { $set: { status: 'expired' } },
    );
    const terminal = await call(`/api/v1/assignments/${other.assignment.id}/cancel`, {
      method: 'POST',
      token: admin.token,
      body: { reason: 'no debería' },
    });
    expect(terminal.status).toBe(400);
  });

  it('caso 9: el atleta B no ve las asignaciones de A', async () => {
    const packId = await createPack();
    await assign(membershipA, { packId });

    const mine = await call('/api/v1/me/assignments', { token: athleteB.token });
    expect(((await mine.json()) as { items: unknown[] }).items).toHaveLength(0);

    const aMine = await call('/api/v1/me/assignments', { token: athleteA.token });
    expect(((await aMine.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('caso 10: el job expire-packs marca vencida una asignación con expiresAt pasado', async () => {
    const packId = await createPack();
    const { assignment } = await assign(membershipA, { packId });
    if (!assignment) throw new Error('no se creó');
    await packAssignments().updateOne(
      { _id: new ObjectId(assignment.id) },
      { $set: { expiresAt: new Date(Date.now() - 86_400_000) } },
    );

    const result = await expirePacksJob.run();
    expect(result.modified).toBe(1);
    const after = await packAssignments().findOne({ _id: new ObjectId(assignment.id) });
    expect(after?.status).toBe('expired');
  });

  it('startsAt a más de un año → 400 (typo de fecha)', async () => {
    const packId = await createPack();
    const far = await assign(membershipA, { packId, startsAt: '2030-01-01' });
    expect(far.res.status).toBe(400);
  });

  it('el CRM ve el historial del miembro; el atleta no accede a esa ruta', async () => {
    const packId = await createPack();
    await assign(membershipA, { packId });

    const crm = await call(`/api/v1/members/${membershipA.toHexString()}/assignments`, {
      token: admin.token,
    });
    expect(crm.status).toBe(200);
    expect(((await crm.json()) as { items: unknown[] }).items).toHaveLength(1);

    const denied = await call(`/api/v1/members/${membershipA.toHexString()}/assignments`, {
      token: athleteA.token,
    });
    expect(denied.status).toBe(403);
  });
});
