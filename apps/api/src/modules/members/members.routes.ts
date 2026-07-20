import {
  createMemberBody,
  entriesQuery,
  membersQuery,
  objectIdString,
  updateMemberBody,
} from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { listForMember } from '../entries/entries.service.js';
import { create, get, list, update } from './members.service.js';

/** Gestión de clientes: solo owner/admin (RN-04, acción members:manage). */
export function membersRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());
  router.use('*', requireRole('members:manage'));

  const memberId = (raw: string): string => {
    const parsed = objectIdString.safeParse(raw);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
    return parsed.data;
  };

  router.get('/', async (c) => {
    const query = parseQuery(c, membersQuery);
    return c.json(await list(c.get('org'), query));
  });

  router.post('/', async (c) => {
    const body = await parseBody(c, createMemberBody);
    const member = await create(c.get('org'), body);
    return c.json({ member }, 201);
  });

  router.get('/:id', async (c) => {
    const member = await get(c.get('org'), memberId(c.req.param('id')));
    return c.json({ member });
  });

  router.patch('/:id', async (c) => {
    const body = await parseBody(c, updateMemberBody);
    const member = await update(c.get('org'), memberId(c.req.param('id')), body);
    return c.json({ member });
  });

  // Vista CRM (F2-02, RN-20): entries del miembro solo sobre catálogo de la org.
  router.get('/:id/entries', async (c) => {
    const query = parseQuery(c, entriesQuery);
    return c.json(await listForMember(c.get('org'), memberId(c.req.param('id')), query));
  });

  return router;
}
