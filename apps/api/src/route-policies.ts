/**
 * Registro de políticas de acceso por ruta (docs/tasks/F1.md F1-09).
 *
 * Es la fuente única que la suite de aislamiento (test/isolation.test.ts)
 * cruza contra las rutas reales registradas en Hono: una ruta sin política
 * —o una política sin ruta— rompe el build. Toda tarea que agrega un endpoint
 * DEBE registrarlo acá en el mismo PR (ver test/README.md).
 */

/**
 * - `public`: sin autenticación.
 * - `user`:   solo `requireAuth` (identidad; sin org).
 * - `member`: `requireAuth` + `tenantGuard` (membresía activa en X-Org-Id).
 * - `admin`:  lo anterior + `requireRole` de una acción owner+admin.
 * - `owner`:  lo anterior + `requireRole` de una acción solo-owner.
 */
export type Access = 'public' | 'user' | 'member' | 'admin' | 'owner';

/** Clave del catálogo de factories (test/factories.ts) para el test de IDOR. */
export type ResourceKind = 'membership' | 'exercise';

export interface RoutePolicy {
  method: string;
  /** Path tal cual lo registra Hono, con `:params` (ej. `/api/v1/members/:id`). */
  path: string;
  access: Access;
  /** Presente si la ruta recibe un `:id` de recurso org-scoped (test de IDOR cross-org). */
  resource?: ResourceKind;
  /** Body mínimo válido para pasar Zod y morir en authz, no antes. */
  sampleBody?: unknown;
}

export const ROUTE_POLICIES: RoutePolicy[] = [
  // auth — todo público salvo change-password (identidad)
  { method: 'POST', path: '/api/v1/auth/register', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/verify-email', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/resend-verification', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/login', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/refresh', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/logout', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/forgot-password', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/reset-password', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/change-password', access: 'user' },

  // me — identidad, sin org
  { method: 'GET', path: '/api/v1/me', access: 'user' },
  { method: 'GET', path: '/api/v1/me/memberships', access: 'user' },

  // orgs — crear/join necesitan identidad; current es org-scoped
  { method: 'POST', path: '/api/v1/orgs', access: 'user' },
  { method: 'POST', path: '/api/v1/orgs/join', access: 'user' },
  { method: 'GET', path: '/api/v1/orgs/current', access: 'member' },
  { method: 'PATCH', path: '/api/v1/orgs/current', access: 'owner' },
  { method: 'POST', path: '/api/v1/orgs/current/regenerate-code', access: 'owner' },

  // members — gestión de clientes (owner+admin); :id es org-scoped → IDOR
  { method: 'GET', path: '/api/v1/members', access: 'admin' },
  { method: 'POST', path: '/api/v1/members', access: 'admin' },
  { method: 'GET', path: '/api/v1/members/:id', access: 'admin', resource: 'membership' },
  { method: 'PATCH', path: '/api/v1/members/:id', access: 'admin', resource: 'membership' },

  // exercises — catálogo org + personales (F2-01); :id org-scoped → IDOR
  { method: 'GET', path: '/api/v1/exercises', access: 'member' },
  {
    method: 'POST',
    path: '/api/v1/exercises',
    access: 'member',
    sampleBody: { name: 'Back Squat', type: 'weight' },
  },
  { method: 'GET', path: '/api/v1/exercises/:id', access: 'member', resource: 'exercise' },
  {
    method: 'PATCH',
    path: '/api/v1/exercises/:id',
    access: 'member',
    resource: 'exercise',
    sampleBody: { name: 'Renombrado' },
  },
  { method: 'POST', path: '/api/v1/exercises/:id/archive', access: 'admin', resource: 'exercise' },
  { method: 'POST', path: '/api/v1/exercises/:id/restore', access: 'admin', resource: 'exercise' },
  { method: 'DELETE', path: '/api/v1/exercises/:id', access: 'member', resource: 'exercise' },
];
