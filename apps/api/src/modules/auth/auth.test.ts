import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { emailTokens, memberships, organizations, refreshTokens, users } from '../../db/collections.js';
import { fakeVerify, hashToken } from '../../lib/crypto.js';
import type { EmailProvider, SendEmailInput } from '../../lib/email.js';
import { logger } from '../../lib/logger.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import { testConfig } from '../../test/helpers.js';
import { verifyAccessToken } from './token-service.js';

vi.mock('../../lib/crypto.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fakeVerify: vi.fn().mockResolvedValue(undefined) };
});

class CaptureEmailProvider implements EmailProvider {
  sends: SendEmailInput[] = [];
  failNext = false;

  send(input: SendEmailInput): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('smtp down'));
    }
    this.sends.push(input);
    return Promise.resolve();
  }
}

const config = testConfig();
const provider = new CaptureEmailProvider();
const app = createApp(config, { emailProvider: provider });

const PASSWORD = 'Sup3r-clave-larga';

function post(path: string, body: unknown) {
  return app.request(`/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function registerUser(email: string): Promise<{ verifyToken: string }> {
  const res = await post('register', { email, password: PASSWORD, name: 'Ana' });
  expect(res.status).toBe(201);
  const send = provider.sends.at(-1);
  expect(send?.template).toBe('verify-email');
  return { verifyToken: send?.data.token ?? '' };
}

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

beforeEach(() => {
  provider.sends = [];
  provider.failNext = false;
  vi.mocked(fakeVerify).mockClear();
});

describe('flujo feliz: register → verify → login', () => {
  it('completa el ciclo con cookie y JWT correctos', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const warnSpy = vi.spyOn(logger, 'warn');

    const { verifyToken } = await registerUser('feliz@test.com');

    const verifyRes = await post('verify-email', { token: verifyToken });
    expect(verifyRes.status).toBe(204);

    const loginRes = await post('login', { email: 'feliz@test.com', password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as {
      accessToken: string;
      user: { id: string; email: string; emailVerified: boolean };
      memberships: unknown[];
    };
    expect(body.user.email).toBe('feliz@test.com');
    expect(body.user.emailVerified).toBe(true);
    expect(body.memberships).toEqual([]);

    // Access token decodificable con sub = user id
    const claims = await verifyAccessToken(body.accessToken, config);
    expect(claims.sub).toBe(body.user.id);

    // Cookie con todos los flags (docs/05-seguridad.md §1)
    const cookie = loginRes.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('refresh_token=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=');

    // Seguridad transversal: ningún token en claro persiste en la DB
    const refreshToken = /refresh_token=([^;]+)/.exec(cookie)?.[1] ?? '';
    const dump = JSON.stringify([
      await users().find({}).toArray(),
      await emailTokens().find({}).toArray(),
      await refreshTokens().find({}).toArray(),
    ]);
    expect(dump).not.toContain(verifyToken);
    expect(dump).not.toContain(refreshToken);
    expect(dump).not.toContain(PASSWORD);

    // La password no aparece en ningún log de la suite
    const logged = JSON.stringify([...infoSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged).not.toContain(PASSWORD);
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('register', () => {
  it('email duplicado (con casing distinto) → 409 EMAIL_TAKEN', async () => {
    await registerUser('dup@test.com');
    const res = await post('register', { email: 'DUP@test.com', password: PASSWORD, name: 'B' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('EMAIL_TAKEN');
  });

  it('password débil (corta o común) → 400 WEAK_PASSWORD', async () => {
    for (const password of ['corta1!', '12345678']) {
      const res = await post('register', { email: 'weak@test.com', password, name: 'A' });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('WEAK_PASSWORD');
    }
  });

  it('campo extra → 400 VALIDATION_ERROR (.strict())', async () => {
    const res = await post('register', {
      email: 'extra@test.com',
      password: PASSWORD,
      name: 'A',
      role: 'owner',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('fallo del provider de email → 201 igual (el usuario usa resend)', async () => {
    provider.failNext = true;
    const res = await post('register', { email: 'mailfail@test.com', password: PASSWORD, name: 'A' });
    expect(res.status).toBe(201);
    expect(provider.sends).toHaveLength(0);
  });
});

describe('verify-email', () => {
  it('token inexistente / ya usado / expirado → 401 TOKEN_INVALID en los tres', async () => {
    const { verifyToken } = await registerUser('vfy@test.com');

    const bogus = await post('verify-email', { token: 'x'.repeat(43) });
    expect(bogus.status).toBe(401);

    expect((await post('verify-email', { token: verifyToken })).status).toBe(204);
    const reused = await post('verify-email', { token: verifyToken });
    expect(reused.status).toBe(401);

    const { verifyToken: expiredToken } = await registerUser('vfy2@test.com');
    await emailTokens().updateOne(
      { tokenHash: hashToken(expiredToken) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await post('verify-email', { token: expiredToken });
    expect(expired.status).toBe(401);
    const body = (await expired.json()) as { error: { code: string } };
    expect(body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('resend-verification', () => {
  it('email inexistente → 202 y cero emails', async () => {
    const res = await post('resend-verification', { email: 'nadie@test.com' });
    expect(res.status).toBe(202);
    expect(provider.sends).toHaveLength(0);
  });

  it('email ya verificado → 202 y cero emails', async () => {
    const { verifyToken } = await registerUser('yaver@test.com');
    await post('verify-email', { token: verifyToken });
    provider.sends = [];
    const res = await post('resend-verification', { email: 'yaver@test.com' });
    expect(res.status).toBe(202);
    expect(provider.sends).toHaveLength(0);
  });

  it('reemite: el token viejo deja de servir, el nuevo funciona', async () => {
    const { verifyToken: oldToken } = await registerUser('resend@test.com');
    const res = await post('resend-verification', { email: 'resend@test.com' });
    expect(res.status).toBe(202);
    const newToken = provider.sends.at(-1)?.data.token ?? '';
    expect(newToken).not.toBe(oldToken);
    expect((await post('verify-email', { token: oldToken })).status).toBe(401);
    expect((await post('verify-email', { token: newToken })).status).toBe(204);
  });
});

describe('login', () => {
  it('password errónea → 401; email inexistente → 401 con fakeVerify (timing)', async () => {
    const { verifyToken } = await registerUser('log@test.com');
    await post('verify-email', { token: verifyToken });

    const wrong = await post('login', { email: 'log@test.com', password: 'incorrecta-123' });
    expect(wrong.status).toBe(401);
    expect(vi.mocked(fakeVerify)).not.toHaveBeenCalled();

    const ghost = await post('login', { email: 'fantasma@test.com', password: 'lo-que-sea-99' });
    expect(ghost.status).toBe(401);
    expect(vi.mocked(fakeVerify)).toHaveBeenCalledOnce();
    const body = (await ghost.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('sin verificar → 403 EMAIL_NOT_VERIFIED', async () => {
    await registerUser('noverif@test.com');
    const res = await post('login', { email: 'noverif@test.com', password: PASSWORD });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('memberships activas e invitadas en la respuesta; disabled excluida', async () => {
    const { verifyToken } = await registerUser('member@test.com');
    await post('verify-email', { token: verifyToken });
    const user = await users().findOne({ email: 'member@test.com' });
    const userId = user?._id ?? new ObjectId();

    const now = new Date();
    const orgIds = [new ObjectId(), new ObjectId(), new ObjectId()];
    await organizations().insertMany(
      orgIds.map(((_id, i) => ({
        _id,
        name: `Box ${String(i)}`,
        slug: `box-${String(i)}`,
        joinCode: `code-${String(i)}`,
        timezone: 'America/Argentina/Buenos_Aires',
        settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      }))),
    );
    await memberships().insertMany([
      { _id: new ObjectId(), orgId: orgIds[0] ?? new ObjectId(), userId, role: 'athlete', status: 'active', profile: {}, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), orgId: orgIds[1] ?? new ObjectId(), userId, role: 'owner', status: 'invited', profile: {}, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), orgId: orgIds[2] ?? new ObjectId(), userId, role: 'athlete', status: 'disabled', profile: {}, createdAt: now, updatedAt: now },
    ]);

    const res = await post('login', { email: 'member@test.com', password: PASSWORD });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      memberships: { orgName: string; role: string; status: string }[];
    };
    expect(body.memberships).toHaveLength(2);
    const statuses = body.memberships.map((m) => m.status).sort();
    expect(statuses).toEqual(['active', 'invited']);
    expect(body.memberships.every((m) => m.orgName.startsWith('Box '))).toBe(true);
  });
});
