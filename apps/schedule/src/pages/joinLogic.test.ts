import type { MembershipSummaryDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { destinationFor, joinErrorView, normalizeCode } from './joinLogic';

const membership = (orgId: string, status: MembershipSummaryDto['status'] = 'active'): MembershipSummaryDto => ({
  id: '0123456789abcdef01234567',
  orgId,
  orgName: 'Box',
  orgSlug: 'box',
  role: 'athlete',
  status,
});

describe('normalizeCode', () => {
  it('lowercasea, recorta espacios y descarta caracteres inválidos', () => {
    expect(normalizeCode(' BAHIA-Cross-x9k2 ')).toBe('bahia-cross-x9k2');
    expect(normalizeCode('Box 42!')).toBe('box42');
    expect(normalizeCode('___')).toBe('');
  });
});

describe('joinErrorView', () => {
  it('mapea cada código a su mensaje y marca reenvío solo en EMAIL_NOT_VERIFIED', () => {
    expect(joinErrorView('ORG_CODE_INVALID', 'x').message).toMatch(/Código inválido/);
    expect(joinErrorView('ORG_CODE_INVALID', 'x').canResend).toBeUndefined();

    const notVerified = joinErrorView('EMAIL_NOT_VERIFIED', 'x');
    expect(notVerified.message).toMatch(/Verificá tu email/);
    expect(notVerified.canResend).toBe(true);

    expect(joinErrorView('RATE_LIMITED', 'x').message).toMatch(/Demasiados intentos/);
    // desconocido → cae al fallback del server
    expect(joinErrorView('WHATEVER', 'mensaje del server').message).toBe('mensaje del server');
  });
});

describe('destinationFor', () => {
  it('1 activa (o menos) → home; varias → select; ignora inactivas', () => {
    expect(destinationFor([membership('a')])).toBe('home');
    expect(destinationFor([membership('a'), membership('b')])).toBe('select');
    expect(destinationFor([membership('a'), membership('b', 'invited')])).toBe('home');
    expect(destinationFor([])).toBe('home');
  });
});
