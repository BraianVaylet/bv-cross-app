import {
  createSessionBody,
  createTemplateBody,
  objectIdString,
  sessionsQuery,
  updateSessionBody,
  updateTemplateBody,
} from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/roles.js';
import { tenantGuard } from '../../middleware/tenant.js';
import {
  cancelSession,
  createManualSession,
  createTemplate,
  listSessions,
  listTemplatesForOrg,
  patchSession,
  patchTemplate,
  removeTemplate,
  sessionAttendees,
} from './schedule.service.js';

const parseId = (raw: string): string => {
  const parsed = objectIdString.safeParse(raw);
  if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
  return parsed.data;
};

/** Plantillas de la grilla semanal (F3-01). Todo bajo `schedule:manage`. */
export function templatesRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());
  router.use('*', requireRole('schedule:manage'));

  router.get('/', async (c) => c.json({ items: await listTemplatesForOrg(c.get('org')) }));

  router.post('/', async (c) => {
    const body = await parseBody(c, createTemplateBody);
    const { template, overlaps } = await createTemplate(c.get('org'), body);
    // Los solapamientos son advertencia, no error: se informan en la respuesta.
    return c.json({ template, ...(overlaps.length > 0 ? { details: { overlaps } } : {}) }, 201);
  });

  router.patch('/:id', async (c) => {
    const body = await parseBody(c, updateTemplateBody);
    const { template, overlaps, regeneratedSessions, keptSessions } = await patchTemplate(
      c.get('org'),
      parseId(c.req.param('id')),
      body,
    );
    return c.json({
      template,
      regeneratedSessions,
      keptSessions,
      ...(overlaps.length > 0 ? { details: { overlaps } } : {}),
    });
  });

  router.delete('/:id', async (c) =>
    c.json(await removeTemplate(c.get('org'), parseId(c.req.param('id')))),
  );

  return router;
}

/** Sesiones materializadas: lectura para miembros, gestión para admins. */
export function sessionsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());

  router.get('/', async (c) => {
    const query = parseQuery(c, sessionsQuery);
    return c.json({ items: await listSessions(c.get('org'), c.get('userId'), query) });
  });

  router.post('/', requireRole('schedule:manage'), async (c) => {
    const body = await parseBody(c, createSessionBody);
    return c.json({ session: await createManualSession(c.get('org'), body) }, 201);
  });

  router.patch('/:id', requireRole('schedule:manage'), async (c) => {
    const body = await parseBody(c, updateSessionBody);
    const session = await patchSession(c.get('org'), parseId(c.req.param('id')), body);
    return c.json({ session });
  });

  router.post('/:id/cancel', requireRole('schedule:manage'), async (c) => {
    const result = await cancelSession(c.get('org'), parseId(c.req.param('id')), c.get('userId'));
    return c.json(result);
  });

  router.get('/:id/attendees', requireRole('schedule:manage'), async (c) => {
    const items = await sessionAttendees(c.get('org'), parseId(c.req.param('id')));
    return c.json({ items });
  });

  return router;
}
