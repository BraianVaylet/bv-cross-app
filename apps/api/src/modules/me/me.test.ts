import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { makeUser, type TestUser } from '../../test/factories.js';
import { testConfig } from '../../test/helpers.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';

const config = testConfig();
const app = createApp(config);

let user: TestUser;

describe('PATCH /me (F2-06)', () => {
  beforeAll(async () => {
    await startTestDb();
    user = await makeUser(config, 'me@f206.test', 'Nombre Viejo');
  }, 120_000);
  afterAll(stopTestDb);

  const patch = (body: unknown, token = user.token) =>
    app.request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  it('actualiza el nombre y lo refleja en GET /me', async () => {
    const res = await patch({ name: '  Nombre Nuevo  ' });
    expect(res.status).toBe(200);
    const { user: dto } = (await res.json()) as { user: { name: string } };
    expect(dto.name).toBe('Nombre Nuevo'); // trim del contrato

    const me = await app.request('/api/v1/me', {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(((await me.json()) as { user: { name: string } }).user.name).toBe('Nombre Nuevo');
  });

  it('nombre vacío → 400 VALIDATION_ERROR', async () => {
    const res = await patch({ name: '   ' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('sin token → 401', async () => {
    const res = await app.request('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(401);
  });
});
