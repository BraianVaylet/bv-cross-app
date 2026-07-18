import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEnv } from '../app.js';
import { createApp } from '../app.js';
import { onError } from '../lib/errors.js';
import { startTestDb, stopTestDb } from '../test/mongo.js';
import { testConfig } from '../test/helpers.js';
import { rateLimit } from './rate-limit.js';

// TRUST_PROXY: la IP viene de x-forwarded-for — controlable por test.
const config = testConfig({ TRUST_PROXY: 'true' });

function buildApp(scope: string, limit = 3, windowSec = 2) {
  const app = new Hono<AppEnv>();
  app.post('/probe', rateLimit(config, { scope, keyBy: 'ip', limit, windowSec }), (c) =>
    c.json({ ok: true }),
  );
  app.onError(onError);
  return app;
}

function hit(app: Hono<AppEnv>, ip: string) {
  return app.request('/probe', { method: 'POST', headers: { 'x-forwarded-for': ip } });
}

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

describe('rateLimit (ventana fija en Mongo)', () => {
  it('límite 3 en 2s: pasan 3, la 4ª → 429 con Retry-After; tras la ventana pasa de nuevo', async () => {
    const app = buildApp('t1');
    for (let i = 0; i < 3; i++) expect((await hit(app, '1.1.1.1')).status).toBe(200);
    const blocked = await hit(app, '1.1.1.1');
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(2);
    const body = (await blocked.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');

    await new Promise((r) => setTimeout(r, (retryAfter + 0.2) * 1000));
    expect((await hit(app, '1.1.1.1')).status).toBe(200);
  }, 15_000);

  it('claves independientes: IP A llena su cupo, IP B pasa', async () => {
    const app = buildApp('t2', 2, 60);
    await hit(app, '2.2.2.2');
    await hit(app, '2.2.2.2');
    expect((await hit(app, '2.2.2.2')).status).toBe(429);
    expect((await hit(app, '3.3.3.3')).status).toBe(200);
  });

  it('dos instancias contra la misma DB comparten contador (N réplicas)', async () => {
    const a = buildApp('t3', 2, 60);
    const b = buildApp('t3', 2, 60);
    expect((await hit(a, '4.4.4.4')).status).toBe(200);
    expect((await hit(b, '4.4.4.4')).status).toBe(200);
    expect((await hit(b, '4.4.4.4')).status).toBe(429);
  });

  it('integración: el 6º login errado consecutivo devuelve 429, no 401', async () => {
    const app = createApp(config);
    const attempt = () =>
      app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'brute@test.com', password: 'incorrecta-99' }),
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('retry-after')).not.toBeNull();
  });
});
