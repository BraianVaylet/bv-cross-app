import {
  loginBody,
  registerBody,
  resendVerificationBody,
  verifyEmailBody,
} from '@bv/contracts';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { parseBody } from '../../lib/http.js';
import type { AuthService } from './auth.service.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './token-service.js';

/** Rutas del módulo auth: parse Zod → servicio → respuesta (sin tocar Mongo). */
export function authRoutes(config: Config, service: AuthService) {
  const router = new Hono<AppEnv>();

  router.post('/register', async (c) => {
    const body = await parseBody(c, registerBody);
    const user = await service.register(body);
    return c.json({ user }, 201);
  });

  router.post('/verify-email', async (c) => {
    const body = await parseBody(c, verifyEmailBody);
    await service.verifyEmail(body.token);
    return c.body(null, 204);
  });

  router.post('/resend-verification', async (c) => {
    const body = await parseBody(c, resendVerificationBody);
    await service.resendVerification(body.email);
    return c.body(null, 202);
  });

  router.post('/login', async (c) => {
    const body = await parseBody(c, loginBody);
    const forwarded = config.TRUST_PROXY ? c.req.header('x-forwarded-for') : undefined;
    const result = await service.login(body, {
      userAgent: c.req.header('user-agent'),
      ip: forwarded?.split(',')[0]?.trim(),
    });
    setCookie(c, REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'Lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      ...(config.COOKIE_DOMAIN !== undefined ? { domain: config.COOKIE_DOMAIN } : {}),
    });
    return c.json({
      accessToken: result.accessToken,
      user: result.user,
      memberships: result.memberships,
    });
  });

  return router;
}
