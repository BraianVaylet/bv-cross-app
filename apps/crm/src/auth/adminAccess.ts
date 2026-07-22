import type { MembershipSummaryDto } from '@bv/contracts';

/** Roles que pueden entrar al CRM (docs/01-funcional.md §3). */
const ADMIN_ROLES = ['owner', 'admin'] as const;

export type AdminAccess =
  | { kind: 'none' } // tiene cuenta, pero en ningún gimnasio es admin
  | { kind: 'onboarding' } // no es miembro de ningún lado: puede crear su gym
  | { kind: 'ready'; memberships: MembershipSummaryDto[] };

/**
 * Qué puede hacer el usuario en el CRM (F3-04).
 *
 * La distinción que importa: alguien que es SOLO atleta no se manda al
 * onboarding (crearía un gimnasio sin querer), se le explica que esta app no
 * es para él. En cambio quien no tiene ninguna membresía sí es el caso del
 * dueño que recién se registra.
 */
export function resolveAdminAccess(memberships: MembershipSummaryDto[]): AdminAccess {
  const admin = memberships.filter(
    (m) => m.status === 'active' && (ADMIN_ROLES as readonly string[]).includes(m.role),
  );
  if (admin.length > 0) return { kind: 'ready', memberships: admin };
  return memberships.length === 0 ? { kind: 'onboarding' } : { kind: 'none' };
}
