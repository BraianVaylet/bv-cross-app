import type { PackAssignmentStatus } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { packAssignments, packs } from '../../db/collections.js';
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

const PACK = {
  name: 'Pack 8 clases',
  classCount: 8,
  durationDays: 30,
  price: 25_000,
  paymentMethod: 'cash' as const,
};

async function createPack(body: Record<string, unknown> = {}): Promise<{ id: string }> {
  const res = await call('/api/v1/packs', { method: 'POST', token: admin.token, body: { ...PACK, ...body } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { pack: { id: string } }).pack;
}

/** Asignación mínima para ejercitar la matriz (F3-03 la crea de verdad). */
async function fakeAssignment(packId: string, status: PackAssignmentStatus): Promise<void> {
  const now = new Date();
  await packAssignments().insertOne({
    _id: new ObjectId(),
    orgId: orgA,
    userId: athlete.id,
    packId: new ObjectId(packId),
    snapshot: {
      name: PACK.name,
      classCount: PACK.classCount,
      durationDays: PACK.durationDays,
      price: PACK.price,
      currency: 'ARS',
      paymentMethod: 'cash',
    },
    startsAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    classesUsed: 0,
    status,
    payment: { amount: PACK.price, method: 'cash', paidAt: now },
    createdAt: now,
    updatedAt: now,
  });
}

async function errorOf(res: Response): Promise<{ code: string; details?: { activeAssignments?: number } }> {
  return ((await res.json()) as { error: { code: string; details?: { activeAssignments?: number } } }).error;
}

describe('packs (F3-02)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Packs');
    admin = await makeUser(config, 'admin@packs.test', 'Admin');
    athlete = await makeUser(config, 'atleta@packs.test', 'Atleta');
    await makeMembership(orgA, admin.id, 'admin');
    await makeMembership(orgA, athlete.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  beforeEach(async () => {
    await Promise.all([packs().deleteMany({}), packAssignments().deleteMany({})]);
  });

  it('caso 1: CRUD feliz; currency siempre ARS y el body no la acepta', async () => {
    const pack = await createPack();
    const doc = await packs().findOne({ _id: new ObjectId(pack.id) });
    expect(doc?.currency).toBe('ARS');

    const rejected = await call('/api/v1/packs', {
      method: 'POST',
      token: admin.token,
      body: { ...PACK, currency: 'USD' }, // .strict() lo rechaza
    });
    expect(rejected.status).toBe(400);

    const list = await call('/api/v1/packs', { token: admin.token });
    const { items } = (await list.json()) as { items: { id: string; activeAssignments: number }[] };
    expect(items).toHaveLength(1);
    expect(items[0]?.activeAssignments).toBe(0);
  });

  it('caso 2: price decimal y durationDays 0 → 400', async () => {
    const decimal = await call('/api/v1/packs', {
      method: 'POST',
      token: admin.token,
      body: { ...PACK, price: 25_000.5 },
    });
    expect(decimal.status).toBe(400);

    const zeroDays = await call('/api/v1/packs', {
      method: 'POST',
      token: admin.token,
      body: { ...PACK, durationDays: 0 },
    });
    expect(zeroDays.status).toBe(400);
  });

  it('caso 3: matriz RN-14 — con asignación active bloquea precio/cupo/duración/método, no nombre ni notas', async () => {
    const pack = await createPack();
    await fakeAssignment(pack.id, 'active');

    // los 4 campos congelados, uno por uno
    for (const [field, value] of [
      ['price', 30_000],
      ['classCount', 10],
      ['durationDays', 60],
      ['paymentMethod', 'debit'],
    ] as const) {
      const res = await call(`/api/v1/packs/${pack.id}`, {
        method: 'PATCH',
        token: admin.token,
        body: { [field]: value },
      });
      expect(res.status, `campo ${field}`).toBe(409);
      const err = await errorOf(res);
      expect(err.code).toBe('PACK_IN_USE');
      expect(err.details?.activeAssignments).toBe(1);
    }

    // name e internalNotes siempre se pueden (el snapshot RN-16 protege al cliente)
    const ok = await call(`/api/v1/packs/${pack.id}`, {
      method: 'PATCH',
      token: admin.token,
      body: { name: 'Pack 8 (temporada)', internalNotes: 'promo invierno' },
    });
    expect(ok.status).toBe(200);
    const { pack: updated } = (await ok.json()) as { pack: { name: string; internalNotes?: string } };
    expect(updated.name).toBe('Pack 8 (temporada)');
    expect(updated.internalNotes).toBe('promo invierno');
  });

  it('caso 3b: con asignación expired (no active) todo vuelve a ser editable', async () => {
    const pack = await createPack();
    await fakeAssignment(pack.id, 'expired');

    const res = await call(`/api/v1/packs/${pack.id}`, {
      method: 'PATCH',
      token: admin.token,
      body: { price: 30_000, classCount: 10 },
    });
    expect(res.status).toBe(200);
    const { pack: updated } = (await res.json()) as { pack: { price: number; classCount: number } };
    expect(updated.price).toBe(30_000);
    expect(updated.classCount).toBe(10);
  });

  it('caso 4: DELETE de pack con historial → 409 sugiere archivar; virgen → 204', async () => {
    const used = await createPack();
    await fakeAssignment(used.id, 'expired'); // histórica, ya no activa

    const blocked = await call(`/api/v1/packs/${used.id}`, { method: 'DELETE', token: admin.token });
    expect(blocked.status).toBe(409);
    const err = ((await blocked.json()) as { error: { code: string; message: string } }).error;
    expect(err.code).toBe('PACK_IN_USE');
    expect(err.message).toMatch(/archivalo/);

    const virgin = await createPack({ name: 'Pack nuevo' });
    const deleted = await call(`/api/v1/packs/${virgin.id}`, { method: 'DELETE', token: admin.token });
    expect(deleted.status).toBe(204);
    expect(await packs().countDocuments({ _id: new ObjectId(virgin.id) })).toBe(0);
  });

  it('caso 5: archive lo saca del listado default y restore lo reactiva (RN-15)', async () => {
    const pack = await createPack();

    const archived = await call(`/api/v1/packs/${pack.id}/archive`, { method: 'POST', token: admin.token });
    expect(archived.status).toBe(200);
    expect(((await archived.json()) as { pack: { archivedAt?: string } }).pack.archivedAt).toBeTruthy();

    const def = await call('/api/v1/packs', { token: admin.token });
    expect(((await def.json()) as { items: unknown[] }).items).toHaveLength(0);

    const withArchived = await call('/api/v1/packs?includeArchived=1', { token: admin.token });
    expect(((await withArchived.json()) as { items: unknown[] }).items).toHaveLength(1);

    const restored = await call(`/api/v1/packs/${pack.id}/restore`, { method: 'POST', token: admin.token });
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { pack: { archivedAt?: string } }).pack.archivedAt).toBeUndefined();
    const after = await call('/api/v1/packs', { token: admin.token });
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('el catálogo es admin-only: el atleta no lo ve', async () => {
    await createPack();
    const res = await call('/api/v1/packs', { token: athlete.token });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('FORBIDDEN_ROLE');
  });

  it('activeAssignments viaja en el DTO para que la UI comunique la matriz', async () => {
    const pack = await createPack();
    await fakeAssignment(pack.id, 'active');
    await fakeAssignment(pack.id, 'active');
    await fakeAssignment(pack.id, 'cancelled'); // no cuenta

    const res = await call('/api/v1/packs', { token: admin.token });
    const { items } = (await res.json()) as { items: { activeAssignments: number }[] };
    expect(items[0]?.activeAssignments).toBe(2);
  });
});
