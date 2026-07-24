import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { exercises, rmEntries } from '../../db/collections.js';
import { makeMembership, makeOrg, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

/** Stats del gimnasio (F3-09): progreso de un cliente y feed de PRs. */

const config = testConfig();
const app = createApp(config);

let orgA: ObjectId;
let admin: TestUser;
let ana: TestUser;
let bruno: TestUser;
let anaMembership: ObjectId;
let sentadilla: ObjectId;
let dominadas: ObjectId;
let personal: ObjectId;

async function call(path: string, token: string): Promise<Response> {
  return app.request(path, {
    headers: { authorization: `Bearer ${token}`, 'x-org-id': orgA.toHexString() },
  });
}

async function makeExercise(
  name: string,
  type: 'weight' | 'reps',
  scope: 'org' | 'personal' = 'org',
  ownerUserId: ObjectId | null = null,
): Promise<ObjectId> {
  const id = new ObjectId();
  const now = new Date();
  await exercises().insertOne({
    _id: id,
    scope,
    orgId: scope === 'org' ? orgA : null,
    ownerUserId,
    name,
    type,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** `orgId` va solo si el ejercicio es de catálogo (RN-20/21). */
async function addEntry(
  userId: ObjectId,
  exerciseId: ObjectId,
  value: number,
  date: string,
  scope: 'org' | 'personal' = 'org',
  measure: 'kg' | 'reps' = 'kg',
): Promise<void> {
  await rmEntries().insertOne({
    _id: new ObjectId(),
    exerciseId,
    userId,
    orgId: scope === 'org' ? orgA : null,
    [measure]: value,
    date,
    createdAt: new Date(),
  });
}

describe('stats (F3-09)', () => {
  beforeAll(async () => {
    await startTestDb();
    orgA = await makeOrg('Box Stats');
    admin = await makeUser(config, 'admin@stats.test', 'Admin');
    ana = await makeUser(config, 'ana@stats.test', 'Ana Fuerte');
    bruno = await makeUser(config, 'bruno@stats.test', 'Bruno Rápido');
    await makeMembership(orgA, admin.id, 'admin');
    anaMembership = await makeMembership(orgA, ana.id, 'athlete');
    await makeMembership(orgA, bruno.id, 'athlete');

    sentadilla = await makeExercise('Sentadilla', 'weight');
    dominadas = await makeExercise('Dominadas', 'reps');
    personal = await makeExercise('Rutina secreta', 'weight', 'personal', ana.id);

    // La serie del ejemplo de la spec.
    for (const [value, date] of [
      [60, '2026-01-05'],
      [70, '2026-02-05'],
      [65, '2026-03-05'],
      [70, '2026-04-05'],
      [72.5, '2026-05-05'],
    ] as [number, string][]) {
      await addEntry(ana.id, sentadilla, value, date);
    }
    // Ana también hace dominadas, y tiene un personal que NO debe aparecer.
    await addEntry(ana.id, dominadas, 10, '2026-06-01', 'org', 'reps');
    await addEntry(ana.id, personal, 999, '2026-06-02', 'personal');
    // Bruno, para que el feed tenga más de una persona.
    await addEntry(bruno.id, sentadilla, 100, '2026-06-03');
  }, 120_000);
  afterAll(stopTestDb);

  it('el progreso marca los PRs y distingue el RM vigente del mejor (RN-22)', async () => {
    const res = await call(
      `/api/v1/stats/members/${anaMembership.toHexString()}/progress?exerciseId=${sentadilla.toHexString()}`,
      admin.token,
    );
    expect(res.status).toBe(200);
    const { progress } = (await res.json()) as {
      progress: {
        exerciseName: string;
        points: { value: number; isPr: boolean }[];
        currentRm: number;
        best: number;
      };
    };

    expect(progress.exerciseName).toBe('Sentadilla');
    expect(progress.points.map((p) => p.value)).toEqual([60, 70, 65, 70, 72.5]);
    expect(progress.points.filter((p) => p.isPr).map((p) => p.value)).toEqual([60, 70, 72.5]);
    // Acá coinciden porque el último es el mejor.
    expect(progress.currentRm).toBe(72.5);
    expect(progress.best).toBe(72.5);
  });

  it('el RM vigente es el de fecha más reciente aunque sea menor (RN-22)', async () => {
    const bajon = await makeExercise('Peso muerto', 'weight');
    await addEntry(ana.id, bajon, 120, '2026-01-10');
    await addEntry(ana.id, bajon, 100, '2026-06-10'); // bajó de marca

    const res = await call(
      `/api/v1/stats/members/${anaMembership.toHexString()}/progress?exerciseId=${bajon.toHexString()}`,
      admin.token,
    );
    const { progress } = (await res.json()) as { progress: { currentRm: number; best: number } };
    expect(progress.currentRm).toBe(100); // el más reciente
    expect(progress.best).toBe(120); // el mejor histórico
  });

  it('los ejercicios personales del atleta no se ven desde el CRM (RN-20)', async () => {
    const lista = await call(
      `/api/v1/stats/members/${anaMembership.toHexString()}/exercises`,
      admin.token,
    );
    const { items } = (await lista.json()) as { items: { id: string; name: string }[] };
    expect(items.map((e) => e.name).sort()).toEqual(['Dominadas', 'Peso muerto', 'Sentadilla']);
    expect(items.some((e) => e.id === personal.toHexString())).toBe(false);

    // Y pedirlo de frente tampoco: no está en el catálogo de la org.
    const directo = await call(
      `/api/v1/stats/members/${anaMembership.toHexString()}/progress?exerciseId=${personal.toHexString()}`,
      admin.token,
    );
    expect(directo.status).toBe(404);
  });

  it('el feed trae los récords del gimnasio, lo más nuevo primero', async () => {
    const res = await call('/api/v1/stats/prs-feed?limit=20', admin.token);
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as {
      items: { userName: string; exerciseName: string; value: number; improvement: number | null }[];
    };

    // Todo lo que aparece es PR y nada es de un ejercicio personal.
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.value === 999)).toBe(false);

    // El 65 y el segundo 70 de Ana no son récord.
    const deAna = items.filter((i) => i.userName === 'Ana Fuerte' && i.exerciseName === 'Sentadilla');
    expect(deAna.map((i) => i.value).sort((a, b) => a - b)).toEqual([60, 70, 72.5]);

    // La primera carga de un par no tiene con qué comparar.
    expect(deAna.find((i) => i.value === 60)?.improvement).toBeNull();
    expect(deAna.find((i) => i.value === 72.5)?.improvement).toBe(2.5);

    // Y el feed cruza personas.
    expect(items.some((i) => i.userName === 'Bruno Rápido')).toBe(true);
  });

  it('el atleta no puede mirar las stats de nadie', async () => {
    const res = await call('/api/v1/stats/prs-feed', ana.token);
    expect(res.status).toBe(403);
  });

  it('presupuesto: el feed responde rápido con historial grande', async () => {
    // ~1200 entries extra sobre 6 pares: el orden de magnitud de un box con
    // meses de uso. El umbral es holgado (×3 del objetivo de 300 ms) para no
    // flakear en CI; el número real se documenta en el PR.
    const extras = [];
    const ejercicios = [sentadilla, dominadas];
    for (let i = 0; i < 1200; i += 1) {
      const userId = i % 2 === 0 ? ana.id : bruno.id;
      const exerciseId = ejercicios[i % 2] ?? sentadilla;
      extras.push({
        _id: new ObjectId(),
        exerciseId,
        userId,
        orgId: orgA,
        kg: 50 + (i % 40),
        date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        createdAt: new Date(),
      });
    }
    await rmEntries().insertMany(extras);

    const t0 = performance.now();
    const res = await call('/api/v1/stats/prs-feed?limit=20', admin.token);
    const ms = performance.now() - t0;

    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(900);
  }, 60_000);
});
