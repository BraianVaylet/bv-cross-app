import type { Role } from './enums.js';

/**
 * Matriz rol → acción (RN-04, docs/05-seguridad.md §2). Única fuente:
 * la usan `requireRole` en la API y el render condicional en los FEs.
 */
export const PERMISSIONS = {
  'org:settings': ['owner'],
  'org:regenerate-code': ['owner'],
  'org:manage-admins': ['owner'],
  'members:manage': ['owner', 'admin'],
  'schedule:manage': ['owner', 'admin'],
  'packs:manage': ['owner', 'admin'],
  'assignments:manage': ['owner', 'admin'],
  'exercises:manage-catalog': ['owner', 'admin'],
  'stats:read': ['owner', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionAction = keyof typeof PERMISSIONS;

export const can = (role: Role, action: PermissionAction): boolean =>
  (PERMISSIONS[action] as readonly Role[]).includes(role);
