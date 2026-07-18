import { createOrgBody, joinOrgBody, updateOrgBody } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { createOrg, getCurrentOrg, joinOrg, regenerateJoinCode, updateOrg } from './orgs.service.js';

export function orgsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));

  router.post('/', async (c) => {
    const body = await parseBody(c, createOrgBody);
    const org = await createOrg(c.get('userId'), body);
    return c.json({ org }, 201);
  });

  router.post(
    '/join',
    rateLimit(config, { scope: 'join:user', keyBy: 'user', limit: 10, windowSec: 3600 }),
    async (c) => {
      const body = await parseBody(c, joinOrgBody);
      const membership = await joinOrg(c.get('userId'), body);
      return c.json({ membership }, 201);
    },
  );

  router.use('/current/*', tenantGuard());
  router.use('/current', tenantGuard());

  router.get('/current', (c) => getCurrentOrg(c.get('org')).then((org) => c.json({ org })));

  router.patch('/current', requireRole('org:settings'), async (c) => {
    const body = await parseBody(c, updateOrgBody);
    const org = await updateOrg(c.get('org'), body);
    return c.json({ org });
  });

  router.post('/current/regenerate-code', requireRole('org:regenerate-code'), async (c) => {
    const result = await regenerateJoinCode(c.get('org'));
    return c.json(result);
  });

  return router;
}
