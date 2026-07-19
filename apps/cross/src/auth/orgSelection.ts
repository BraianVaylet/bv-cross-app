import type { MembershipSummaryDto } from '@bv/contracts';

export const ORG_STORAGE_KEY = 'bv.activeOrgId';

export type OrgResolution =
  | { kind: 'join' } // 0 membresías activas → /join
  | { kind: 'auto'; orgId: string } // 1 → selección automática
  | { kind: 'select' } // >1 sin guardada válida → /select-org
  | { kind: 'restored'; orgId: string }; // guardada y sigue siendo miembro

/**
 * Selección de organización activa (F7 del Funcional): el id guardado solo
 * vale si sigue habiendo membresía activa de esa org; si no, se re-selecciona.
 */
export function resolveActiveOrg(
  memberships: MembershipSummaryDto[],
  storedOrgId: string | null,
): OrgResolution {
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) return { kind: 'join' };

  if (storedOrgId && active.some((m) => m.orgId === storedOrgId)) {
    return { kind: 'restored', orgId: storedOrgId };
  }
  if (active.length === 1) {
    const only = active[0];
    if (only) return { kind: 'auto', orgId: only.orgId };
  }
  return { kind: 'select' };
}
