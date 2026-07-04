import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { DomainError, onError } from './lib/errors.js';
import { testConfig } from './test/helpers.js';

const app = createApp(testConfig());

describe('healthz', () => {
  it('reports degraded (503) without Mongo, and never leaks the URI', async () => {
    // Esta suite corre sin initMongo: healthz debe degradar, no mentir.
    const res = await app.request('/healthz');
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('degraded');
    expect(body.mongo).toBe('down');
    expect(JSON.stringify(body)).not.toContain('mongodb://');
  });
});

describe('unknown api routes', () => {
  it('returns the 404 envelope', async () => {
    const res = await app.request('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Ruta inexistente.' },
    });
  });
});

describe('body limit (16 KB)', () => {
  it('rejects oversized bodies with 413', async () => {
    const res = await app.request('/api/v1/nope', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(17 * 1024) },
      body: JSON.stringify({ x: 'a'.repeat(17 * 1024) }),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('CORS', () => {
  it('preflight from allowed origin gets CORS headers with credentials', async () => {
    const res = await app.request('/api/v1/nope', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.bvcross.test',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.bvcross.test');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('unknown origin gets no allow-origin header', async () => {
    const res = await app.request('/api/v1/nope', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('origin guard on mutations (CSRF, patrón v1)', () => {
  it('rejects mutations from foreign origins with BAD_ORIGIN', async () => {
    const res = await app.request('/api/v1/nope', {
      method: 'POST',
      headers: { origin: 'https://evil.test', host: 'api.bvcross.test' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_ORIGIN');
  });

  it('allows mutations from configured app origins (dies at 404, not 403)', async () => {
    const res = await app.request('/api/v1/nope', {
      method: 'POST',
      headers: { origin: 'https://app.bvcross.test', host: 'api.bvcross.test' },
    });
    expect(res.status).toBe(404);
  });

  it('GET is never origin-blocked', async () => {
    const res = await app.request('/api/v1/nope', {
      headers: { origin: 'https://evil.test' },
    });
    expect(res.status).toBe(404);
  });
});

describe('error handling (onError real, app mínima — el catch-all del app impide inyectar rutas)', () => {
  const broken = new Hono();
  broken.get('/boom-domain', () => {
    throw new DomainError('NO_CREDITS', 'No tenés clases disponibles.');
  });
  broken.get('/boom', () => {
    throw new Error('secreto interno con stack');
  });
  broken.onError(onError);

  it('DomainError maps to its catalog status and envelope', async () => {
    const res = await broken.request('/boom-domain');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'NO_CREDITS', message: 'No tenés clases disponibles.' },
    });
  });

  it('unexpected errors return INTERNAL without stack', async () => {
    const res = await broken.request('/boom');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secreto interno');
    expect(text).not.toContain('at ');
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' },
    });
  });
});

describe('api cache headers', () => {
  it('api responses are private, no-store', async () => {
    const res = await app.request('/api/v1/nope');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('every response carries X-Request-Id', async () => {
    const res = await app.request('/api/v1/nope');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
