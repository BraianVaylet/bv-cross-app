import { can, type PermissionAction } from '@bv/contracts';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.js';
import { DomainError } from '../lib/errors.js';

/**
 * requireRole (RN-04): recibe una ACCIÓN de la matriz PERMISSIONS de
 * @bv/contracts — nunca roles sueltos: la matriz es la única fuente.
 * Una acción inexistente no compila. Requiere tenantGuard antes.
 */
export function requireRole(action: PermissionAction): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!can(c.get('org').role, action)) {
      throw new DomainError('FORBIDDEN_ROLE', 'No tenés permisos para esta acción.');
    }
    await next();
  };
}
