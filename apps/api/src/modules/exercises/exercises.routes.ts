import { createExerciseBody, exercisesQuery, objectIdString, updateExerciseBody } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { archive, create, get, list, remove, update } from './exercises.service.js';

/**
 * Catálogo de la org + ejercicios personales (F2-01, RN-19/20/21).
 * Todo requiere membresía activa; el scoping fino (admin para catálogo,
 * dueño para personales) vive en el service.
 */
export function exercisesRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());

  const exerciseId = (raw: string): string => {
    const parsed = objectIdString.safeParse(raw);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
    return parsed.data;
  };

  router.get('/', async (c) => {
    const query = parseQuery(c, exercisesQuery);
    const items = await list(c.get('org'), c.get('userId'), query);
    return c.json({ items });
  });

  router.post('/', async (c) => {
    const body = await parseBody(c, createExerciseBody);
    const exercise = await create(c.get('org'), c.get('userId'), body);
    return c.json({ exercise }, 201);
  });

  router.get('/:id', async (c) => {
    const exercise = await get(c.get('org'), c.get('userId'), exerciseId(c.req.param('id')));
    return c.json({ exercise });
  });

  router.patch('/:id', async (c) => {
    const body = await parseBody(c, updateExerciseBody);
    const exercise = await update(c.get('org'), c.get('userId'), exerciseId(c.req.param('id')), body);
    return c.json({ exercise });
  });

  router.post('/:id/archive', requireRole('exercises:manage-catalog'), async (c) => {
    const exercise = await archive(c.get('org'), exerciseId(c.req.param('id')), true);
    return c.json({ exercise });
  });

  router.post('/:id/restore', requireRole('exercises:manage-catalog'), async (c) => {
    const exercise = await archive(c.get('org'), exerciseId(c.req.param('id')), false);
    return c.json({ exercise });
  });

  router.delete('/:id', async (c) => {
    await remove(c.get('org'), c.get('userId'), exerciseId(c.req.param('id')));
    return c.body(null, 204);
  });

  return router;
}
