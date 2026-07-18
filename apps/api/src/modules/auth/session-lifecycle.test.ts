import { sign } from 'hono/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { refreshTokens } from '../../db/collections.js';
import { generateToken, hashToken } from '../../lib/crypto.js';
import type { EmailProvider, SendEmailInput } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import { testConfig } from '../../test/helpers.js';
import { verifyAccessToken } from './token-service.js';

vi.mock('../../lib/crypto.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateToken: vi.fn(actual.generateToken as () => string) };
});

class CaptureEmailProvider implements EmailProvider {
  sends: SendEmailInput[] = [];

  send(input: SendEmailInput): Promise<void> {
    this.sends.push(input);
    return Promise.resolve();
  }
}

const config = testConfig();
const provider = new CaptureEmailProvider();
const app = createApp(config, { emailProvider: provider });

const PASSWORD = 'Sup3r-clave-larga';

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function cookieValue(res: Response): string {
  return /refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
}

/** register → verify → login. Devuelve tokens de la sesión. */
async function createSession(email: string): Promise<{ access: string; refresh: string }> {
  const reg = await post('register', { email, password: PASSWORD, name: 'Ana' });
  expect(reg.status).toBe(201);
  const verifyToken = provider.sends.at(-1)?.data.token ?? '';
  expect((await post('verify-email', { token: verifyToken })).status).toBe(204);
  return login(email);
}

async function login(email: string): Promise<{ access: string; refresh: string }> {
  const res = await post('login', { email, password: PASSWORD });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accessToken: string };
  return { access: body.accessToken, refresh: cookieValue(res) };
}

function refreshWith(token: string) {
  return post('refresh', undefined, { cookie: `refresh_token=${token}` });
}

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

beforeEach(() => {
  provider.sends = [];
});

describe('refresh: rotación con detección de reuso', () => {
  it('rota: access y cookie nuevos; el escenario de robo tumba la familia entera', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const session = await createSession('rot@test.com');

    const first = await refreshWith(session.refresh);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { accessToken: string };
    const rotated = cookieValue(first);
    // JWT HS256 es determinístico: con mismo {sub, iat, exp} (mismo segundo)
    // el string coincide — lo que importa es que sea un access válido nuevo.
    const claims = await verifyAccessToken(firstBody.accessToken, config);
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(0);
    expect(rotated).not.toBe(session.refresh);
    expect(first.headers.get('set-cookie')).toContain('Path=/api/v1/auth');

    // Robo: el token viejo (ya rotado) se presenta de nuevo
    const reuse = await refreshWith(session.refresh);
    expect(reuse.status).toBe(401);
    expect(
      warnSpy.mock.calls.some(([, msg]) => typeof msg === 'string' && msg.includes('reuse')),
    ).toBe(true);

    // La familia cayó completa: el token "bueno" rotado también murió
    expect((await refreshWith(rotated)).status).toBe(401);
    warnSpy.mockRestore();
  });

  it('cadena de 5 refresh: familia única, solo el último vivo', async () => {
    const session = await createSession('chain@test.com');
    let current = session.refresh;
    for (let i = 0; i < 5; i++) {
      const res = await refreshWith(current);
      expect(res.status).toBe(200);
      current = cookieValue(res);
    }
    const last = await refreshTokens().findOne({ tokenHash: hashToken(current) });
    expect(last).not.toBeNull();
    const mine = await refreshTokens()
      .find({ familyId: last?.familyId })
      .toArray();
    expect(mine).toHaveLength(6); // login + 5 rotaciones, familia única
    const alive = mine.filter((d) => d.revokedAt === undefined);
    expect(alive).toHaveLength(1);
    expect(alive[0]?.tokenHash).toBe(hashToken(current));
  });

  it('sin cookie o expirado → 401', async () => {
    expect((await post('refresh')).status).toBe(401);
    const session = await createSession('exp@test.com');
    await refreshTokens().updateOne(
      { tokenHash: hashToken(session.refresh) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect((await refreshWith(session.refresh)).status).toBe(401);
  });

  it('transacción marca+inserta: si el insert falla, el original NO queda revocado', async () => {
    const session = await createSession('tx@test.com');
    // Forzamos E11000 en el insert de la rotación: el próximo token generado
    // colisiona con un tokenHash pre-insertado.
    const fixed = 'A'.repeat(43);
    const { ObjectId } = await import('mongodb');
    await refreshTokens().insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      tokenHash: hashToken(fixed),
      familyId: new ObjectId(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    vi.mocked(generateToken).mockReturnValueOnce(fixed);

    const res = await refreshWith(session.refresh);
    expect(res.status).toBe(500); // fallo interno, no un 401 engañoso

    const original = await refreshTokens().findOne({ tokenHash: hashToken(session.refresh) });
    expect(original?.revokedAt).toBeUndefined();
    // Y el usuario puede reintentar con el MISMO token
    expect((await refreshWith(session.refresh)).status).toBe(200);
  });
});

describe('logout', () => {
  it('revoca la familia (refresh posterior 401) y vacía la cookie; idempotente sin cookie', async () => {
    const session = await createSession('out@test.com');
    const res = await post('logout', undefined, { cookie: `refresh_token=${session.refresh}` });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await refreshWith(session.refresh)).status).toBe(401);
    expect((await post('logout')).status).toBe(204);
  });
});

describe('forgot-password / reset-password', () => {
  it('email inexistente → 202 y cero emails', async () => {
    const res = await post('forgot-password', { email: 'nadie@test.com' });
    expect(res.status).toBe(202);
    expect(provider.sends).toHaveLength(0);
  });

  it('reset completo: password nueva entra, la vieja no, sesiones previas caen, token single-use', async () => {
    const session = await createSession('rst@test.com');
    expect((await post('forgot-password', { email: 'rst@test.com' })).status).toBe(202);
    const send = provider.sends.at(-1);
    expect(send?.template).toBe('reset-password');
    const resetToken = send?.data.token ?? '';

    // Password débil NO quema el token
    const weak = await post('reset-password', { token: resetToken, newPassword: '12345678' });
    expect(weak.status).toBe(400);

    const ok = await post('reset-password', { token: resetToken, newPassword: 'Nuev4-clave-larga' });
    expect(ok.status).toBe(204);

    // Sesión previa al reset: muerta
    expect((await refreshWith(session.refresh)).status).toBe(401);
    // Password vieja: 401; nueva: 200
    expect((await post('login', { email: 'rst@test.com', password: PASSWORD })).status).toBe(401);
    const relog = await post('login', { email: 'rst@test.com', password: 'Nuev4-clave-larga' });
    expect(relog.status).toBe(200);
    // Token de reset reusado: 401
    const reuse = await post('reset-password', { token: resetToken, newPassword: 'Otr4-clave-larga' });
    expect(reuse.status).toBe(401);
  });

  it('reset sobre cuenta sin verificar la deja verificada (probó control del email)', async () => {
    const reg = await post('register', { email: 'nover@test.com', password: PASSWORD, name: 'A' });
    expect(reg.status).toBe(201);
    await post('forgot-password', { email: 'nover@test.com' });
    const resetToken = provider.sends.at(-1)?.data.token ?? '';
    expect(
      (await post('reset-password', { token: resetToken, newPassword: 'Nuev4-clave-larga' })).status,
    ).toBe(204);
    const res = await post('login', { email: 'nover@test.com', password: 'Nuev4-clave-larga' });
    expect(res.status).toBe(200);
  });
});

describe('change-password [requireAuth]', () => {
  it('sin Bearer → 401 TOKEN_INVALID; JWT expirado → 401 TOKEN_EXPIRED', async () => {
    const noAuth = await post('change-password', { currentPassword: 'a', newPassword: 'b' });
    expect(noAuth.status).toBe(401);
    expect(((await noAuth.json()) as { error: { code: string } }).error.code).toBe('TOKEN_INVALID');

    const iat = Math.floor(Date.now() / 1000) - 3600;
    const expired = await sign({ sub: 'x', iat, exp: iat + 60 }, config.JWT_SECRET, 'HS256');
    const res = await post(
      'change-password',
      { currentPassword: 'a', newPassword: 'b' },
      { authorization: `Bearer ${expired}` },
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('TOKEN_EXPIRED');
  });

  it('current errónea → 401; débil → 400', async () => {
    const session = await createSession('chg@test.com');
    const bad = await post(
      'change-password',
      { currentPassword: 'incorrecta-99', newPassword: 'Nuev4-clave-larga' },
      { authorization: `Bearer ${session.access}` },
    );
    expect(bad.status).toBe(401);
    const weak = await post(
      'change-password',
      { currentPassword: PASSWORD, newPassword: '12345678' },
      { authorization: `Bearer ${session.access}` },
    );
    expect(weak.status).toBe(400);
  });

  it('OK → la sesión propia sigue viva, la otra sesión del mismo user muere', async () => {
    const sessionA = await createSession('multi@test.com');
    const sessionB = await login('multi@test.com'); // segunda familia

    const res = await post(
      'change-password',
      { currentPassword: PASSWORD, newPassword: 'Nuev4-clave-larga' },
      {
        authorization: `Bearer ${sessionA.access}`,
        cookie: `refresh_token=${sessionA.refresh}`,
      },
    );
    expect(res.status).toBe(204);

    expect((await refreshWith(sessionA.refresh)).status).toBe(200); // propia viva
    expect((await refreshWith(sessionB.refresh)).status).toBe(401); // ajena muerta
  });
});
