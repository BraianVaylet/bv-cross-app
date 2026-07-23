import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { exercises, rmEntries } from '../../db/collections.js';
import {
  makeMembership,
  makeOrg,
  makeUser,
  type TestUser,
} from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

const config = testConfig();
const app = createApp(config);

let orgA: ObjectId;
let admin: TestUser;
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

async function createExercise(
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string; scope: string; type: string }> {
  const res = await call('/api/v1/exercises', { method: 'POST', token, body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { exercise: { id: string; scope: string; type: string } }).exercise;
}

async function addEntry(exerciseId: string, userId: ObjectId): Promise<void> {
  await rmEntries().insertOne({
    _id: new ObjectId(),
    exerciseId: new ObjectId(exerciseId),
    userId,
    orgId: null,
    kg: 100,
    date: '2026-07-01',
    createdAt: new Date(),
  });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('exercises (F2-01)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Org Ejercicios');
    admin = await makeUser(config, 'admin@ex.test', 'Admin');
    athleteA = await makeUser(config, 'a@ex.test', 'Atleta A');
    athleteB = await makeUser(config, 'b@ex.test', 'Atleta B');
    await makeMembership(orgA, admin.id, 'admin');
    await makeMembership(orgA, athleteA.id, 'athlete');
    await makeMembership(orgA, athleteB.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  it('caso 1: admin crea org-exercise visible para otro miembro; athlete sin scope → personal; athlete con scope org → 403', async () => {
    const created = await createExercise(admin.token, {
      name: 'Deadlift',
      type: 'weight',
      scope: 'org',
    });
    expect(created.scope).toBe('org');

    const seen = await call(`/api/v1/exercises/${created.id}`, { token: athleteA.token });
    expect(seen.status).toBe(200);

    const personal = await createExercise(athleteA.token, { name: 'Mi Curl', type: 'weight' });
    expect(personal.scope).toBe('personal');

    const forbidden = await call('/api/v1/exercises', {
      method: 'POST',
      token: athleteA.token,
      body: { name: 'Colado', type: 'weight', scope: 'org' },
    });
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe('FORBIDDEN_ROLE');
  });

  it('caso 2: personal de A invisible para B y para el admin (RN-20) → 404', async () => {
    const personal = await createExercise(athleteA.token, { name: 'Privado A', type: 'reps' });

    for (const token of [athleteB.token, admin.token]) {
      const res = await call(`/api/v1/exercises/${personal.id}`, { token });
      expect(res.status).toBe(404);
    }
  });

  it('caso 4: archivado sale del GET default, entra con includeArchived=1 (admin); detalle sigue legible', async () => {
    const ex = await createExercise(admin.token, {
      name: 'Viejo Snatch',
      type: 'weight',
      scope: 'org',
    });
    const arch = await call(`/api/v1/exercises/${ex.id}/archive`, {
      method: 'POST',
      token: admin.token,
    });
    expect(arch.status).toBe(200);

    const listDefault = await call('/api/v1/exercises?scope=org', { token: athleteA.token });
    const defaultItems = ((await listDefault.json()) as { items: { id: string }[] }).items;
    expect(defaultItems.some((e) => e.id === ex.id)).toBe(false);

    const listArchived = await call('/api/v1/exercises?scope=org&includeArchived=1', {
      token: admin.token,
    });
    const archivedItems = ((await listArchived.json()) as { items: { id: string }[] }).items;
    expect(archivedItems.some((e) => e.id === ex.id)).toBe(true);

    // athlete pidiendo archivados → 403 (RN-19)
    const denied = await call('/api/v1/exercises?includeArchived=1', { token: athleteA.token });
    expect(denied.status).toBe(403);

    // historial legible: el detalle del archivado responde (RN-19)
    const detail = await call(`/api/v1/exercises/${ex.id}`, { token: athleteA.token });
    expect(detail.status).toBe(200);

    // restore lo devuelve al catálogo
    await call(`/api/v1/exercises/${ex.id}/restore`, { method: 'POST', token: admin.token });
    const after = await call('/api/v1/exercises?scope=org', { token: athleteA.token });
    expect(((await after.json()) as { items: { id: string }[] }).items.some((e) => e.id === ex.id)).toBe(true);
  });

  it('caso 5: TYPE_LOCKED con entries → 409; sin entries el cambio de type pasa', async () => {
    const free = await createExercise(athleteA.token, { name: 'Cambiable', type: 'weight' });
    const okRes = await call(`/api/v1/exercises/${free.id}`, {
      method: 'PATCH',
      token: athleteA.token,
      body: { type: 'reps' },
    });
    expect(okRes.status).toBe(200);

    const locked = await createExercise(athleteA.token, { name: 'Bloqueado', type: 'weight' });
    await addEntry(locked.id, athleteA.id);
    const lockedRes = await call(`/api/v1/exercises/${locked.id}`, {
      method: 'PATCH',
      token: athleteA.token,
      body: { type: 'reps' },
    });
    expect(lockedRes.status).toBe(409);
    expect(await errorCode(lockedRes)).toBe('TYPE_LOCKED');
  });

  it('caso 5b: el listado de catálogo del admin trae hasEntries; el del atleta no (F3-08)', async () => {
    const conHistorial = await createExercise(admin.token, {
      name: 'Con historial',
      type: 'weight',
      scope: 'org',
    });
    const sinHistorial = await createExercise(admin.token, {
      name: 'Sin historial',
      type: 'weight',
      scope: 'org',
    });
    await addEntry(conHistorial.id, athleteA.id);

    // Admin sobre el catálogo: cada uno sabe si puede cambiar de tipo.
    const adminList = await call('/api/v1/exercises?scope=org', { token: admin.token });
    const items = ((await adminList.json()) as { items: { id: string; hasEntries?: boolean }[] }).items;
    expect(items.find((e) => e.id === conHistorial.id)?.hasEntries).toBe(true);
    expect(items.find((e) => e.id === sinHistorial.id)?.hasEntries).toBe(false);

    // El atleta ve el mismo catálogo pero sin el flag: no lo necesita ni lo paga.
    const athleteList = await call('/api/v1/exercises?scope=org', { token: athleteA.token });
    const athItems = ((await athleteList.json()) as { items: { id: string; hasEntries?: boolean }[] }).items;
    expect(athItems.find((e) => e.id === conHistorial.id)?.hasEntries).toBeUndefined();
  });

  it('caso 6: DELETE personal borra en cascada sus entries; DELETE de catálogo → 403', async () => {
    const personal = await createExercise(athleteA.token, { name: 'Borrable', type: 'weight' });
    for (let i = 0; i < 3; i += 1) await addEntry(personal.id, athleteA.id);

    const del = await call(`/api/v1/exercises/${personal.id}`, {
      method: 'DELETE',
      token: athleteA.token,
    });
    expect(del.status).toBe(204);
    expect(await exercises().countDocuments({ _id: new ObjectId(personal.id) })).toBe(0);
    expect(await rmEntries().countDocuments({ exerciseId: new ObjectId(personal.id) })).toBe(0);

    const orgEx = await createExercise(admin.token, {
      name: 'Institucional',
      type: 'weight',
      scope: 'org',
    });
    const delOrg = await call(`/api/v1/exercises/${orgEx.id}`, {
      method: 'DELETE',
      token: admin.token,
    });
    expect(delOrg.status).toBe(403);
  });

  it('caso 7: nombre duplicado en catálogo (case-insensitive) → 400; como personal → OK', async () => {
    await createExercise(admin.token, { name: 'Back Squat', type: 'weight', scope: 'org' });
    const dup = await call('/api/v1/exercises', {
      method: 'POST',
      token: admin.token,
      body: { name: 'back squat', type: 'weight', scope: 'org' },
    });
    expect(dup.status).toBe(400);

    const personal = await createExercise(athleteA.token, { name: 'back squat', type: 'weight' });
    expect(personal.scope).toBe('personal');
  });

  it('caso 8: en all cada athlete ve catálogo + solo SUS personales', async () => {
    const catalog = await createExercise(admin.token, { name: 'Thruster', type: 'weight', scope: 'org' });
    const mineA = await createExercise(athleteA.token, { name: 'Personal A8', type: 'reps' });
    const mineB = await createExercise(athleteB.token, { name: 'Personal B8', type: 'reps' });

    const res = await call('/api/v1/exercises', { token: athleteA.token });
    const ids = ((await res.json()) as { items: { id: string }[] }).items.map((e) => e.id);
    expect(ids).toContain(catalog.id);
    expect(ids).toContain(mineA.id);
    expect(ids).not.toContain(mineB.id);
  });
});
