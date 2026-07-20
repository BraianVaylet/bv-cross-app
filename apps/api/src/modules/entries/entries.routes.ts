import { createEntryBody, entriesQuery, objectIdString } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { create, list, remove } from './entries.service.js';

/**
 * Registros de carga del atleta (F2-02, RN-21/22/23). Siempre propios:
 * la vista del CRM vive bajo /members/:id/entries (members.routes).
 */
export function entriesRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());

  const entryId = (raw: string): string => {
    const parsed = objectIdString.safeParse(raw);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
    return parsed.data;
  };

  router.get('/', async (c) => {
    const query = parseQuery(c, entriesQuery);
    return c.json(await list(c.get('userId'), query));
  });

  router.post('/', async (c) => {
    const body = await parseBody(c, createEntryBody);
    const entry = await create(c.get('org'), c.get('userId'), body);
    return c.json({ entry }, 201);
  });

  router.delete('/:id', async (c) => {
    await remove(c.get('userId'), entryId(c.req.param('id')));
    return c.body(null, 204);
  });

  return router;
}
