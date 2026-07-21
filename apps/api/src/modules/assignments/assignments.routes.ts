import { cancelAssignmentBody, objectIdString } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { cancelAssignment } from './assignments.service.js';

/**
 * Acciones sobre una asignación puntual (F3-03). El alta y los listados
 * cuelgan de /members/:id/assignments y /me/assignments.
 */
export function assignmentsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());
  router.use('*', requireRole('assignments:manage'));

  router.post('/:id/cancel', async (c) => {
    const parsed = objectIdString.safeParse(c.req.param('id'));
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
    const body = await parseBody(c, cancelAssignmentBody);
    const assignment = await cancelAssignment(c.get('org'), parsed.data, body.reason);
    return c.json({ assignment });
  });

  return router;
}
