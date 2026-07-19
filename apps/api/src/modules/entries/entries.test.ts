import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { rmEntries } from '../../db/collections.js';
import { issueAccessToken } from '../../modules/auth/token-service.js';
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
let membershipA: ObjectId;

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
): Promise<string> {
  const res = await call('/api/v1/exercises', { method: 'POST', token, body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { exercise: { id: string } }).exercise.id;
}

async function postEntry(token: string, body: Record<string, unknown>): Promise<Response> {
  return call('/api/v1/entries', { method: 'POST', token, body });
}

async function entryId(res: Response): Promise<string> {
  return ((await res.json()) as { entry: { id: string } }).entry.id;
}

describe('entries (F2-02)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Org Entries'); // tz America/Argentina/Buenos_Aires
    admin = await makeUser(config, 'admin@en.test', 'Admin');
    athleteA = await makeUser(config, 'a@en.test', 'Atleta A');
    athleteB = await makeUser(config, 'b@en.test', 'Atleta B');
    await makeMembership(orgA, admin.id, 'admin');
    membershipA = await makeMembership(orgA, athleteA.id, 'athlete');
    await makeMembership(orgA, athleteB.id, 'athlete');
  }, 120_000);
  afterAll(stopTestDb);

  it('caso 1: feliz weight y reps; medida cruzada → 400 WRONG_MEASURE', async () => {
    const weightEx = await createExercise(athleteA.token, { name: 'W1', type: 'weight' });
    const repsEx = await createExercise(athleteA.token, { name: 'R1', type: 'reps' });

    const okKg = await postEntry(athleteA.token, { exerciseId: weightEx, kg: 102.5, date: '2026-07-01' });
    expect(okKg.status).toBe(201);
    const okReps = await postEntry(athleteA.token, { exerciseId: repsEx, reps: 12, date: '2026-07-01' });
    expect(okReps.status).toBe(201);

    const wrong = await postEntry(athleteA.token, { exerciseId: repsEx, kg: 50, date: '2026-07-01' });
    expect(wrong.status).toBe(400);
    const body = (await wrong.json()) as { error: { details?: { code?: string; expected?: string } } };
    expect(body.error.details?.code).toBe('WRONG_MEASURE');
    expect(body.error.details?.expected).toBe('reps');
  });

  it('caso 2: rangos, fecha inválida, futura; "hoy 23:30 AR / mañana UTC" aceptada', async () => {
    const ex = await createExercise(athleteA.token, { name: 'W2', type: 'weight' });

    expect((await postEntry(athleteA.token, { exerciseId: ex, kg: 0, date: '2026-07-01' })).status).toBe(400);
    expect((await postEntry(athleteA.token, { exerciseId: ex, kg: 100.555, date: '2026-07-01' })).status).toBe(400);
    const reps25 = await createExercise(athleteA.token, { name: 'R2', type: 'reps' });
    expect((await postEntry(athleteA.token, { exerciseId: reps25, reps: 2.5, date: '2026-07-01' })).status).toBe(400);
    expect((await postEntry(athleteA.token, { exerciseId: ex, kg: 100, date: '2026-13-01' })).status).toBe(400);
    expect((await postEntry(athleteA.token, { exerciseId: ex, kg: 100, date: '2099-01-01' })).status).toBe(400);

    // Clock fijo: 2026-07-20T02:30Z = 2026-07-19 23:30 en AR (UTC-3).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-20T02:30:00Z'));
    try {
      // token fresco: el de beforeAll expira al mover el clock (TTL 15 min)
      const token = await issueAccessToken(athleteA.id.toHexString(), config);
      const today = await postEntry(token, { exerciseId: ex, kg: 100, date: '2026-07-19' });
      expect(today.status).toBe(201); // en UTC ya es mañana; en AR sigue siendo hoy
      const tomorrow = await postEntry(token, { exerciseId: ex, kg: 100, date: '2026-07-20' });
      expect(tomorrow.status).toBe(400); // futura en AR aunque sea "hoy" UTC
    } finally {
      vi.useRealTimers();
    }
  });

  it('caso 3: RN-22 — vigente = fecha más reciente; empate lo gana el _id mayor', async () => {
    const ex = await createExercise(athleteA.token, { name: 'W3', type: 'weight' });
    for (const [kg, date] of [
      [100, '2026-06-10'],
      [130, '2026-06-25'],
      [120, '2026-06-20'],
    ] as const) {
      expect((await postEntry(athleteA.token, { exerciseId: ex, kg, date })).status).toBe(201);
    }
    const tieFirst = await postEntry(athleteA.token, { exerciseId: ex, kg: 131, date: '2026-06-25' });
    const tieId = await entryId(tieFirst);

    const res = await call(`/api/v1/entries?exerciseId=${ex}`, { token: athleteA.token });
    const { items } = (await res.json()) as { items: { id: string; kg: number; date: string }[] };
    expect(items[0]?.date).toBe('2026-06-25');
    expect(items[0]?.id).toBe(tieId); // mismo date: creada después gana
    expect(items.map((i) => i.date)).toEqual(['2026-06-25', '2026-06-25', '2026-06-20', '2026-06-10']);
  });

  it('caso 4: LAST_ENTRY — con 1 entry DELETE 409; con 2 borra OK', async () => {
    const ex = await createExercise(athleteA.token, { name: 'W4', type: 'weight' });
    const only = await entryId(await postEntry(athleteA.token, { exerciseId: ex, kg: 90, date: '2026-07-01' }));

    const denied = await call(`/api/v1/entries/${only}`, { method: 'DELETE', token: athleteA.token });
    expect(denied.status).toBe(409);
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe('LAST_ENTRY');

    await postEntry(athleteA.token, { exerciseId: ex, kg: 95, date: '2026-07-02' });
    const ok = await call(`/api/v1/entries/${only}`, { method: 'DELETE', token: athleteA.token });
    expect(ok.status).toBe(204);
  });

  it('caso 5: atleta A no lee ni borra entries de B → 404 / lista sin ajenas', async () => {
    const exB = await createExercise(athleteB.token, { name: 'W5B', type: 'weight' });
    const entryB = await entryId(await postEntry(athleteB.token, { exerciseId: exB, kg: 80, date: '2026-07-01' }));

    const del = await call(`/api/v1/entries/${entryB}`, { method: 'DELETE', token: athleteA.token });
    expect(del.status).toBe(404);

    const listA = await call('/api/v1/entries', { token: athleteA.token });
    const ids = ((await listA.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids).not.toContain(entryB);
  });

  it('caso 6: vista CRM — solo catálogo, omite personales (RN-20)', async () => {
    const catalogEx = await createExercise(admin.token, { name: 'Catálogo 6', type: 'weight', scope: 'org' });
    const personalEx = await createExercise(athleteA.token, { name: 'Personal 6', type: 'weight' });
    const onCatalog = await entryId(
      await postEntry(athleteA.token, { exerciseId: catalogEx, kg: 60, date: '2026-07-01' }),
    );
    const onPersonal = await entryId(
      await postEntry(athleteA.token, { exerciseId: personalEx, kg: 61, date: '2026-07-01' }),
    );

    const res = await call(`/api/v1/members/${membershipA.toHexString()}/entries`, { token: admin.token });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids).toContain(onCatalog);
    expect(ids).not.toContain(onPersonal);

    // athlete no accede a la vista CRM
    const denied = await call(`/api/v1/members/${membershipA.toHexString()}/entries`, { token: athleteA.token });
    expect(denied.status).toBe(403);
  });

  it('caso 7: ejercicio archivado — entry nueva 400, historial legible', async () => {
    const ex = await createExercise(admin.token, { name: 'Arch 7', type: 'weight', scope: 'org' });
    await postEntry(athleteA.token, { exerciseId: ex, kg: 70, date: '2026-07-01' });
    await call(`/api/v1/exercises/${ex}/archive`, { method: 'POST', token: admin.token });

    const rejected = await postEntry(athleteA.token, { exerciseId: ex, kg: 75, date: '2026-07-02' });
    expect(rejected.status).toBe(400);
    const msg = ((await rejected.json()) as { error: { message: string } }).error.message;
    expect(msg).toMatch(/archivado/);

    const history = await call(`/api/v1/entries?exerciseId=${ex}`, { token: athleteA.token });
    expect(((await history.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('caso 8: painFlag persistido y presente en el DTO', async () => {
    const ex = await createExercise(athleteA.token, { name: 'W8', type: 'weight' });
    const created = await postEntry(athleteA.token, {
      exerciseId: ex,
      kg: 50,
      date: '2026-07-01',
      painFlag: true,
      comment: 'molestia lumbar',
    });
    const dto = ((await created.json()) as { entry: { painFlag?: boolean; comment?: string } }).entry;
    expect(dto.painFlag).toBe(true);
    expect(dto.comment).toBe('molestia lumbar');
  });

  it('caso 9: stamping RN-21 — personal orgId null; catálogo orgId de la org', async () => {
    const personalEx = await createExercise(athleteA.token, { name: 'W9P', type: 'weight' });
    const catalogEx = await createExercise(admin.token, { name: 'W9C', type: 'weight', scope: 'org' });

    const personalId = await entryId(
      await postEntry(athleteA.token, { exerciseId: personalEx, kg: 40, date: '2026-07-01' }),
    );
    const catalogId = await entryId(
      await postEntry(athleteA.token, { exerciseId: catalogEx, kg: 41, date: '2026-07-01' }),
    );

    const personalDoc = await rmEntries().findOne({ _id: new ObjectId(personalId) });
    const catalogDoc = await rmEntries().findOne({ _id: new ObjectId(catalogId) });
    expect(personalDoc?.orgId).toBeNull();
    expect(catalogDoc?.orgId?.equals(orgA)).toBe(true);
  });
});
