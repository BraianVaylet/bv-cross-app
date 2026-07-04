import { sign, verify } from 'hono/jwt';
import { ObjectId } from 'mongodb';
import type { Config } from '../../config.js';
import { refreshTokens } from '../../db/collections.js';
import { generateToken, hashToken } from '../../lib/crypto.js';

/**
 * Emisión del par access/refresh (DEC-04, docs/02-arquitectura.md §5).
 * Access: JWT HS256 con solo { sub, iat, exp } — roles y orgs los resuelve
 * tenantGuard por request. Refresh: opaco 256 bits, en DB solo su hash,
 * agrupado por familyId para detección de reuso (F1-05).
 */

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface AccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
}

export interface RefreshMeta {
  userAgent?: string;
  ip?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function issueAccessToken(userId: string, config: Config): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    sub: userId,
    iat,
    exp: iat + config.ACCESS_TOKEN_TTL_MIN * 60,
  };
  return sign({ ...claims }, config.JWT_SECRET, 'HS256');
}

/** Lanza (JwtTokenExpired / JwtTokenInvalid de hono) si la firma o exp fallan. */
export async function verifyAccessToken(token: string, config: Config): Promise<AccessTokenClaims> {
  const payload = await verify(token, config.JWT_SECRET, 'HS256');
  return payload as unknown as AccessTokenClaims;
}

/**
 * Genera y persiste un refresh token. `familyId` nuevo en login; la rotación
 * (F1-05) reusa la familia del token que reemplaza.
 */
export async function issueRefreshToken(
  userId: string,
  config: Config,
  meta: RefreshMeta = {},
  familyId: ObjectId = new ObjectId(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await refreshTokens().insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    tokenHash: hashToken(token),
    familyId,
    expiresAt,
    createdAt: new Date(),
    ...(meta.userAgent !== undefined ? { userAgent: meta.userAgent } : {}),
    ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
  });
  return { token, expiresAt };
}

export async function issuePair(
  userId: string,
  config: Config,
  meta: RefreshMeta = {},
): Promise<TokenPair> {
  const [accessToken, refresh] = await Promise.all([
    issueAccessToken(userId, config),
    issueRefreshToken(userId, config, meta),
  ]);
  return { accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt };
}
