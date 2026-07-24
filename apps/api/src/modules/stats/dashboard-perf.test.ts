import type { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateLoad } from '../../test/loadgen.js';
import { createApp } from '../../app.js';
import { getDb } from '../../db/client.js';
import { ensureIndexes } from '../../db/indexes.js';
import { makeMembership, makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

/**
 * Presupuesto del dashboard (F3-10).
 *
 * El objetivo del producto es **p95 < 300 ms** ([Escalabilidad §2](
 * ../../../../docs/07-escalabilidad.md): pasar de ahí es el disparador para
 * pre-agregar stats). Este test corre con `mongodb-memory-server` en CI, así
 * que el umbral es holgado —×4 del objetivo— para cazar regresiones de orden
 * de magnitud sin flakear en una máquina compartida.
 *
 * **La escala se configura por env**, así que la medición de la etapa "éxito
 * inicial" del documento (100 gimnasios, ~1M documentos) es el MISMO test con
 * otros números, no un procedimiento aparte que nadie vuelve a correr:
 *
 *   LOADGEN_ORGS=100 LOADGEN_MONTHS=3 pnpm --filter @bv/api exec vitest run \
 *     src/modules/stats/dashboard-perf.test.ts
 *
 * Lo que prueba con datos: que el costo del dashboard NO crece con el tamaño
 * de la base, solo con el de la org. Por eso se generan orgs vecinas y se mide
 * contra una sola.
 */

const config = testConfig();
const app = createApp(config);

const num = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

/** Por defecto: vecinos suficientes para que los índices discriminen por org. */
const ORGS = num('LOADGEN_ORGS', 8);
const MESES = num('LOADGEN_MONTHS', 1);
const MEDICIONES = 20;
const UMBRAL_P95_MS = 1_200;

let orgId: ObjectId;
let admin: TestUser;

describe('presupuesto del dashboard (F3-10)', () => {
  beforeAll(async () => {
    await startTestDb();
    await ensureIndexes(getDb()); // sin índices la medición no dice nada

    const { orgIds, docs, ms } = await generateLoad({ orgs: ORGS, months: MESES, seed: 7 });
    orgId = orgIds[0] as ObjectId;
    console.info(`loadgen: ${docs} docs en ${ms} ms (${ORGS} orgs × ${MESES} mes)`);

    admin = await makeUser(config, 'admin@perf.test', 'Admin Perf');
    await makeMembership(orgId, admin.id, 'admin');
  }, 300_000);
  afterAll(stopTestDb);

  it(`p95 del dashboard bajo el umbral con ${ORGS} orgs cargadas`, async () => {
    const headers = {
      authorization: `Bearer ${admin.token}`,
      'x-org-id': orgId.toHexString(),
    };

    // Una corrida en frío antes de medir: la primera paga el plan de cada
    // pipeline y no representa el estado en el que vive el endpoint.
    expect((await app.request('/api/v1/stats/dashboard', { headers })).status).toBe(200);

    const muestras: number[] = [];
    for (let i = 0; i < MEDICIONES; i += 1) {
      const t0 = performance.now();
      const res = await app.request('/api/v1/stats/dashboard', { headers });
      muestras.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }

    muestras.sort((a, b) => a - b);
    const p95 = muestras[Math.floor(muestras.length * 0.95) - 1] as number;
    const mediana = muestras[Math.floor(muestras.length / 2)] as number;
    console.info(`dashboard: mediana ${mediana.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms`);

    expect(p95).toBeLessThan(UMBRAL_P95_MS);
  }, 120_000);

  it('devuelve datos de SU org y nada de las vecinas', async () => {
    const res = await app.request('/api/v1/stats/dashboard', {
      headers: { authorization: `Bearer ${admin.token}`, 'x-org-id': orgId.toHexString() },
    });
    const { dashboard } = (await res.json()) as {
      dashboard: { month: { revenue: number }; expiringAssignments: unknown[] };
    };

    // Con 150 atletas y un pack cada uno, el facturado del mes tiene que ser
    // del orden de una org, no de las ocho.
    expect(dashboard.month.revenue).toBeGreaterThan(0);
    expect(dashboard.month.revenue).toBeLessThan(150 * 32_000 + 1);
    expect(dashboard.expiringAssignments.length).toBeGreaterThan(0);
  });
});
