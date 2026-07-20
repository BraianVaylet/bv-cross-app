import { updateMeBody } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import type { AuthService } from '../auth/auth.service.js';

/** /me: perfil propio y membresías para el selector de org (F1-07, F7 funcional). */
export function meRoutes(config: Config, service: AuthService) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));

  router.get('/', async (c) => {
    const user = await service.getMe(c.get('userId'));
    return c.json({ user });
  });

  router.patch('/', async (c) => {
    const body = await parseBody(c, updateMeBody);
    const user = await service.updateName(c.get('userId'), body.name);
    return c.json({ user });
  });

  router.get('/memberships', async (c) => {
    const memberships = await service.myMemberships(c.get('userId'));
    return c.json({ memberships });
  });

  return router;
}
