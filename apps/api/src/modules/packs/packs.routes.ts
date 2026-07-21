import { createPackBody, objectIdString, packsQuery, updatePackBody } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { create, list, remove, setArchived, update } from './packs.service.js';

/**
 * Catálogo de packs (F3-02). Todo admin: en fase 1 el atleta solo ve SUS
 * asignaciones, no el catálogo (se relaja si entra el pago online).
 */
export function packsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());
  router.use('*', requireRole('packs:manage'));

  const packId = (raw: string): string => {
    const parsed = objectIdString.safeParse(raw);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
    return parsed.data;
  };

  router.get('/', async (c) => {
    const query = parseQuery(c, packsQuery);
    return c.json({ items: await list(c.get('org'), query) });
  });

  router.post('/', async (c) => {
    const body = await parseBody(c, createPackBody);
    return c.json({ pack: await create(c.get('org'), body) }, 201);
  });

  router.patch('/:id', async (c) => {
    const body = await parseBody(c, updatePackBody);
    const pack = await update(c.get('org'), packId(c.req.param('id')), body);
    return c.json({ pack });
  });

  router.delete('/:id', async (c) => {
    await remove(c.get('org'), packId(c.req.param('id')));
    return c.body(null, 204);
  });

  router.post('/:id/archive', async (c) => {
    const pack = await setArchived(c.get('org'), packId(c.req.param('id')), true);
    return c.json({ pack });
  });

  router.post('/:id/restore', async (c) => {
    const pack = await setArchived(c.get('org'), packId(c.req.param('id')), false);
    return c.json({ pack });
  });

  return router;
}
