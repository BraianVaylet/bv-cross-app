import { createBookingBody, objectIdString } from '@bv/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../app.js';
import type { Config } from '../../config.js';
import { DomainError } from '../../lib/errors.js';
import { parseBody } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { tenantGuard } from '../../middleware/tenant.js';
import { cancelBooking, createBooking } from './bookings.service.js';

const parseId = (raw: string): string => {
  const parsed = objectIdString.safeParse(raw);
  if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Id inválido.');
  return parsed.data;
};

/**
 * Reservas del atleta (F4-02). Cualquier miembro reserva para sí mismo: no hay
 * forma de reservar en nombre de otro (el `userId` sale del token, nunca del
 * body) ni de cancelar la reserva ajena (el filtro incluye el userId).
 */
export function bookingsRoutes(config: Config) {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth(config));
  router.use('*', tenantGuard());

  router.post('/', async (c) => {
    const body = await parseBody(c, createBookingBody);
    return c.json(await createBooking(c.get('org'), c.get('userId'), body), 201);
  });

  router.post('/:id/cancel', async (c) =>
    c.json(await cancelBooking(c.get('org'), c.get('userId'), parseId(c.req.param('id')))),
  );

  return router;
}
