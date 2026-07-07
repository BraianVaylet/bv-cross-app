import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';
import type { Config } from '../config.js';
import { rateLimits } from '../db/collections.js';
import { DomainError } from '../lib/errors.js';

export interface RateLimitOptions {
  /** Prefijo del contador, ej. 'login:ip' — un scope por combinación endpoint×clave. */
  scope: string;
  keyBy: 'ip' | 'body-email' | 'user';
  limit: number;
  windowSec: number;
}

/**
 * Ventana fija en Mongo (docs/tasks/F1.md F1-06): sobrevive deploys y
 * comparte contador entre N réplicas. El documento expira solo (índice TTL
 * sobre expiresAt); el margen de 60 s cubre el barrido perezoso del monitor.
 */
export function rateLimit(config: Config, opts: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = await resolveKey(c, opts.keyBy, config);
    // Sin clave resoluble no se limita: un body sin email lo rechaza el schema
    // del handler; la IP siempre existe en runtime real (conninfo o proxy).
    if (!key) return next();

    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSec / opts.windowSec) * opts.windowSec;
    const id = `${opts.scope}:${key}:${String(windowStart)}`;
    const doc = await rateLimits().findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((windowStart + opts.windowSec + 60) * 1000) },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if ((doc?.count ?? 0) > opts.limit) {
      const retryAfter = Math.max(1, windowStart + opts.windowSec - nowSec);
      c.header('Retry-After', String(retryAfter));
      throw new DomainError('RATE_LIMITED', 'Demasiados intentos. Probá de nuevo en un rato.');
    }
    await next();
  };
}

async function resolveKey(
  c: Context<AppEnv>,
  keyBy: RateLimitOptions['keyBy'],
  config: Config,
): Promise<string | undefined> {
  switch (keyBy) {
    case 'ip':
      return clientIp(c, config);
    case 'user':
      return c.get('userId');
    case 'body-email': {
      try {
        const raw: unknown = await c.req.json();
        const email =
          typeof raw === 'object' && raw !== null ? (raw as { email?: unknown }).email : undefined;
        return typeof email === 'string' ? email.trim().toLowerCase() : undefined;
      } catch {
        return undefined;
      }
    }
  }
}

/** IP real respetando TRUST_PROXY (patrón v1). */
function clientIp(c: Context<AppEnv>, config: Config): string | undefined {
  if (config.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim();
  }
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
