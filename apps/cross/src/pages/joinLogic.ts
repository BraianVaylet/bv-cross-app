import type { MembershipSummaryDto } from '@bv/contracts';

/**
 * Normaliza el código del gimnasio mientras se escribe (RN-01): lowercase y
 * solo `[a-z0-9-]`. Así " BAHIA-Cross-x9k2 " se ve y se envía como
 * "bahia-cross-x9k2" sin que el usuario pelee con mayúsculas o espacios.
 */
export function normalizeCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export interface JoinErrorView {
  message: string;
  /** true → ofrecer CTA de reenvío de verificación. */
  canResend?: boolean;
}

/**
 * Traduce el código de error del join a un mensaje accionable (spec F2-04).
 * ALREADY_MEMBER no se muestra como error acá: el componente lo trata como
 * caso feliz (ya es miembro → a selección).
 */
export function joinErrorView(code: string, fallback: string): JoinErrorView {
  switch (code) {
    case 'ORG_CODE_INVALID':
      return { message: 'Código inválido. Pedile el código a tu gimnasio.' };
    case 'EMAIL_NOT_VERIFIED':
      return { message: 'Verificá tu email antes de unirte a un gimnasio.', canResend: true };
    case 'RATE_LIMITED':
      return { message: 'Demasiados intentos. Esperá un momento antes de reintentar.' };
    default:
      return { message: fallback };
  }
}

/** Destino tras un join exitoso o un ALREADY_MEMBER: 1 activa → Home; varias → selección. */
export function destinationFor(memberships: MembershipSummaryDto[]): 'home' | 'select' {
  return memberships.filter((m) => m.status === 'active').length <= 1 ? 'home' : 'select';
}
