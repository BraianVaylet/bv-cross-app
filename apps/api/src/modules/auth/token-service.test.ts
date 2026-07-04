import { sign } from 'hono/jwt';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refreshTokens } from '../../db/collections.js';
import { hashToken } from '../../lib/crypto.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import { testConfig } from '../../test/helpers.js';
import {
  issueAccessToken,
  issuePair,
  issueRefreshToken,
  verifyAccessToken,
} from './token-service.js';

const config = testConfig();
const USER_ID = new ObjectId().toHexString();

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

describe('access token (JWT HS256)', () => {
  it('claims: sub = userId, exp - iat = TTL configurado, sin roles ni orgs', async () => {
    const token = await issueAccessToken(USER_ID, config);
    const claims = await verifyAccessToken(token, config);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.exp - claims.iat).toBe(config.ACCESS_TOKEN_TTL_MIN * 60);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('rechaza token expirado', async () => {
    const iat = Math.floor(Date.now() / 1000) - 3600;
    const expired = await sign({ sub: USER_ID, iat, exp: iat + 60 }, config.JWT_SECRET, 'HS256');
    await expect(verifyAccessToken(expired, config)).rejects.toThrow();
  });

  it('rechaza firma inválida (otro secret)', async () => {
    const token = await issueAccessToken(USER_ID, config);
    const other = testConfig({ JWT_SECRET: 'y'.repeat(48) });
    await expect(verifyAccessToken(token, other)).rejects.toThrow();
  });
});

describe('refresh token', () => {
  it('persiste SOLO el hash, con familyId y expiresAt según TTL', async () => {
    const { token, expiresAt } = await issueRefreshToken(USER_ID, config, {
      userAgent: 'vitest',
      ip: '10.0.0.1',
    });
    const doc = await refreshTokens().findOne({ tokenHash: hashToken(token) });
    expect(doc).not.toBeNull();
    expect(doc?.tokenHash).not.toBe(token);
    expect(doc?.familyId).toBeInstanceOf(ObjectId);
    expect(doc?.revokedAt).toBeUndefined();
    expect(doc?.userAgent).toBe('vitest');
    const ttlMs = config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - Date.now() - ttlMs)).toBeLessThan(5000);
    // El token en claro no existe en ningún documento
    const all = await refreshTokens().find({}).toArray();
    expect(JSON.stringify(all)).not.toContain(token);
  });

  it('issuePair emite access + refresh coherentes', async () => {
    const pair = await issuePair(USER_ID, config);
    const claims = await verifyAccessToken(pair.accessToken, config);
    expect(claims.sub).toBe(USER_ID);
    expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
