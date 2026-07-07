import {
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resendVerificationBody,
  resetPasswordBody,
  verifyEmailBody,
} from '@bv/contracts';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import type { AuthService } from './auth.service.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, type RefreshMeta } from './token-service.js';

/** Rutas del módulo auth: parse Zod → servicio → respuesta (sin tocar Mongo). */
export function authRoutes(config: Config, service: AuthService) {
  const router = new Hono<AppEnv>();

  const refreshMeta = (c: Parameters<typeof getCookie>[0]): RefreshMeta => {
    const forwarded = config.TRUST_PROXY ? c.req.header('x-forwarded-for') : undefined;
    return {
      userAgent: c.req.header('user-agent'),
      ip: forwarded?.split(',')[0]?.trim(),
    };
  };

  const setRefreshCookie = (c: Parameters<typeof setCookie>[0], token: string): void => {
    setCookie(c, REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'Lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      ...(config.COOKIE_DOMAIN !== undefined ? { domain: config.COOKIE_DOMAIN } : {}),
    });
  };

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
    const result = await service.login(body, refreshMeta(c));
    setRefreshCookie(c, result.refreshToken);
    return c.json({
      accessToken: result.accessToken,
      user: result.user,
      memberships: result.memberships,
    });
  });

  router.post('/refresh', async (c) => {
    const token = getCookie(c, REFRESH_COOKIE_NAME);
    if (!token) throw new DomainError('TOKEN_INVALID', 'La sesión ya no es válida.');
    const pair = await service.refresh(token, refreshMeta(c));
    setRefreshCookie(c, pair.refreshToken);
    return c.json({ accessToken: pair.accessToken });
  });

  router.post('/logout', async (c) => {
    await service.logout(getCookie(c, REFRESH_COOKIE_NAME));
    deleteCookie(c, REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return c.body(null, 204);
  });

  router.post('/forgot-password', async (c) => {
    const body = await parseBody(c, forgotPasswordBody);
    await service.forgotPassword(body.email);
    return c.body(null, 202);
  });

  router.post('/reset-password', async (c) => {
    const body = await parseBody(c, resetPasswordBody);
    await service.resetPassword(body.token, body.newPassword);
    return c.body(null, 204);
  });

  router.post('/change-password', requireAuth(config), async (c) => {
    const body = await parseBody(c, changePasswordBody);
    await service.changePassword(c.get('userId'), body, getCookie(c, REFRESH_COOKIE_NAME));
    return c.body(null, 204);
  });

  return router;
}
