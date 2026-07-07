import type { MiddlewareHandler } from 'hono';
import { JwtTokenExpired } from 'hono/utils/jwt/types';
import type { AppEnv } from '../app.js';
import type { Config } from '../config.js';
import { DomainError } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/token-service.js';

/**
 * requireAuth (docs/tasks/F1.md F1-06): Bearer JWT → userId en contexto.
 * TOKEN_EXPIRED es un código DISTINTO de TOKEN_INVALID a propósito: el FE
 * dispara el refresh silencioso solo ante TOKEN_EXPIRED.
 */
export function requireAuth(config: Config): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new DomainError('TOKEN_INVALID', 'Autenticación requerida.');
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const claims = await verifyAccessToken(token, config);
      c.set('userId', claims.sub);
    } catch (err) {
      if (err instanceof JwtTokenExpired) {
        throw new DomainError('TOKEN_EXPIRED', 'La sesión expiró, renovála.');
      }
      throw new DomainError('TOKEN_INVALID', 'Autenticación inválida.');
    }
    await next();
  };
}
