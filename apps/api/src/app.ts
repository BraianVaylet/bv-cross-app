import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Config } from './config.js';
import { pingMongo } from './db/client.js';
import { createEmailProvider, type EmailProvider } from './lib/email.js';
import { errorBody, onError } from './lib/errors.js';
import { requestLogger } from './lib/logger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';

export interface AppVariables {
  requestId: string;
  userId: string;
  org: { orgId: string; role: string; membershipId: string };
}

export type AppEnv = { Variables: AppVariables };

/** Dependencias inyectables (tests pasan mocks; producción usa los defaults). */
export interface AppDeps {
  emailProvider?: EmailProvider;
}

const MAX_BODY_BYTES = 16 * 1024;

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Instancia de la API (docs/02-arquitectura.md §9). Recibe la config para ser
 * testeable sin tocar process.env. El estado (Mongo) se inyecta en index.ts.
 */
export function createApp(config: Config, deps: AppDeps = {}) {
  const app = new Hono<AppEnv>();
  const emailProvider = deps.emailProvider ?? createEmailProvider(config);

  app.use(requestLogger());

  // API pura: CSP mínima, sin frames, sin sniffing (docs/05-seguridad.md §3).
  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
      crossOriginResourcePolicy: 'same-site',
    }),
  );

  // CORS: allowlist exacta de los FEs + credenciales (cookie de refresh).
  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        if (!origin) return undefined;
        if (config.APP_ORIGINS.includes(origin)) return origin;
        if (!config.isProd && DEV_ORIGIN.test(origin)) return origin;
        return undefined;
      },
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Org-Id'],
      maxAge: 600,
    }),
  );

  // Defensa CSRF adicional a SameSite (patrón v1): mutaciones solo desde
  // orígenes conocidos. Requests sin Origin (curl, server-to-server) pasan:
  // no portan cookies de browser.
  app.use('/api/*', async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
    const origin = c.req.header('origin');
    if (!origin) return next();
    const host = (config.TRUST_PROXY && c.req.header('x-forwarded-host')) || c.req.header('host') || '';
    const proto =
      (config.TRUST_PROXY && c.req.header('x-forwarded-proto')) ||
      new URL(c.req.url).protocol.replace(':', '');
    const self = `${proto}://${host}`;
    const allowed =
      origin === self ||
      config.APP_ORIGINS.includes(origin) ||
      (!config.isProd && DEV_ORIGIN.test(origin));
    if (allowed) return next();
    return c.json(errorBody('BAD_ORIGIN', 'Origen no permitido.'), 403);
  });

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(errorBody('VALIDATION_ERROR', 'El cuerpo supera el tamaño máximo (16 KB).'), 413),
    }),
  );

  // Respuestas por-usuario: ningún CDN debe cachearlas (patrón v1).
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'private, no-store');
  });

  app.get('/healthz', async (c) => {
    const mongoOk = await pingMongo();
    return c.json(
      {
        status: mongoOk ? 'ok' : 'degraded',
        mongo: mongoOk ? 'ok' : 'down',
        uptime: Math.round(process.uptime()),
      },
      mongoOk ? 200 : 503,
    );
  });

  app.route('/api/v1/auth', authRoutes(config, createAuthService({ config, emailProvider })));

  app.all('/api/*', (c) => c.json(errorBody('NOT_FOUND', 'Ruta inexistente.'), 404));

  app.onError(onError);

  return app;
}
