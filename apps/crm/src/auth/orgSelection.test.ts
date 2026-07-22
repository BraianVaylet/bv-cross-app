import type { MembershipSummaryDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { resolveActiveOrg } from './orgSelection';

const membership = (orgId: string, status: MembershipSummaryDto['status'] = 'active'): MembershipSummaryDto => ({
  id: '0123456789abcdef01234567',
  orgId,
  orgName: `Org ${orgId.slice(-2)}`,
  orgSlug: `org-${orgId.slice(-2)}`,
  timezone: 'America/Argentina/Buenos_Aires',
  sessionGenerationDays: 14,
  cancellationWindowHours: 2,
  role: 'athlete',
  status,
});

const ORG_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('caso 5 — selección de org activa', () => {
  it('0 membresías → join', () => {
    expect(resolveActiveOrg([], null)).toEqual({ kind: 'join' });
  });

  it('membresías solo invited/disabled no cuentan → join', () => {
    expect(resolveActiveOrg([membership(ORG_A, 'disabled')], null)).toEqual({ kind: 'join' });
  });

  it('1 activa → auto-selección', () => {
    expect(resolveActiveOrg([membership(ORG_A)], null)).toEqual({ kind: 'auto', orgId: ORG_A });
  });

  it('2 activas sin guardada → select', () => {
    expect(resolveActiveOrg([membership(ORG_A), membership(ORG_B)], null)).toEqual({ kind: 'select' });
  });

  it('guardada válida → restaurada (aunque haya varias)', () => {
    expect(resolveActiveOrg([membership(ORG_A), membership(ORG_B)], ORG_B)).toEqual({
      kind: 'restored',
      orgId: ORG_B,
    });
  });

  it('guardada inválida (ya no es miembro) → re-selección', () => {
    expect(resolveActiveOrg([membership(ORG_A), membership(ORG_B)], 'cccccccccccccccccccccccc')).toEqual({
      kind: 'select',
    });
    // con una sola: cae en auto hacia la vigente
    expect(resolveActiveOrg([membership(ORG_A)], 'cccccccccccccccccccccccc')).toEqual({
      kind: 'auto',
      orgId: ORG_A,
    });
  });
});
