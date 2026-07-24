import { objectIdString, progressQuery, prsFeedQuery } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import {
  memberExercisesWithData,
  memberProgress,
  prsFeed,
  resolveMemberUser,
} from './stats.service.js';

const parseId = (raw: string): string => {
  const parsed = objectIdString.safeParse(raw);
  if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
  return parsed.data;
};

/** Estadísticas del gimnasio (F3-09). Todo admin-only: son datos de clientes. */
export function statsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());
  router.use('*', requireRole('stats:read'));

  // El `:id` se resuelve ANTES de la query: una ficha de otra org da 404
  // aunque falte el `exerciseId` (si no, el 400 taparía el 404).
  router.get('/members/:id/progress', async (c) => {
    const userId = await resolveMemberUser(c.get('org'), parseId(c.req.param('id')));
    const query = parseQuery(c, progressQuery);
    const progress = await memberProgress(c.get('org'), userId, query.exerciseId);
    return c.json({ progress });
  });

  /** Ejercicios sobre los que este cliente ya cargó: llena el selector. */
  router.get('/members/:id/exercises', async (c) => {
    const userId = await resolveMemberUser(c.get('org'), parseId(c.req.param('id')));
    return c.json({ items: await memberExercisesWithData(c.get('org'), userId) });
  });

  router.get('/prs-feed', async (c) => {
    const query = parseQuery(c, prsFeedQuery);
    return c.json({ items: await prsFeed(c.get('org'), query.limit) });
  });

  return router;
}
