import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { pino } from 'pino';

/**
 * Logger estructurado JSON (docs/07-escalabilidad.md §5).
 * Redacción de secretos: nunca headers de auth ni cookies.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[redacted]',
  },
});

/** requestId + log de acceso con durationMs. /healthz queda fuera (ruido de uptime checks). */
export const requestLogger = (): MiddlewareHandler => async (c, next) => {
  const requestId = randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);

  const start = performance.now();
  await next();

  if (c.req.path === '/healthz') return;
  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    },
    'request',
  );
};
