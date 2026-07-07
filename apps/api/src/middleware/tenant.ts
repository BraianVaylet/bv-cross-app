import type { MiddlewareHandler } from 'hono';
import { ObjectId } from 'mongodb';
import type { AppEnv } from '../app.js';
import { memberships } from '../db/collections.js';
import { DomainError } from '../lib/errors.js';

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * tenantGuard (docs/02-arquitectura.md §5, RN-03): valida membresía ACTIVA
 * en la org del header X-Org-Id y cuelga { orgId, role, membershipId } del
 * contexto. Mismo NOT_A_MEMBER para inexistente/disabled/invited: el estado
 * de una membresía no se filtra a quien no es miembro pleno.
 * Requiere requireAuth antes (usa userId del contexto).
 */
export function tenantGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const orgHeader = c.req.header('x-org-id');
    if (!orgHeader) {
      throw new DomainError('ORG_HEADER_MISSING', 'Falta el header X-Org-Id.');
    }
    if (!OBJECT_ID_RE.test(orgHeader)) {
      throw new DomainError('VALIDATION_ERROR', 'X-Org-Id inválido.');
    }
    const membership = await memberships().findOne({
      orgId: new ObjectId(orgHeader),
      userId: new ObjectId(c.get('userId')),
    });
    if (!membership || membership.status !== 'active') {
      throw new DomainError('NOT_A_MEMBER', 'No sos miembro de esta organización.');
    }
    c.set('org', {
      orgId: orgHeader,
      role: membership.role,
      membershipId: membership._id.toHexString(),
    });
    await next();
  };
}
