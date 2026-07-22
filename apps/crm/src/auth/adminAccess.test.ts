import type { MembershipSummaryDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { resolveAdminAccess } from './adminAccess';

const membership = (
  role: MembershipSummaryDto['role'],
  status: MembershipSummaryDto['status'] = 'active',
): MembershipSummaryDto => ({
  id: '0123456789abcdef01234567',
  orgId: `org-${role}`,
  orgName: `Box ${role}`,
  orgSlug: `box-${role}`,
  role,
  status,
  timezone: 'America/Argentina/Buenos_Aires',
  sessionGenerationDays: 14,
  cancellationWindowHours: 2,
});

describe('resolveAdminAccess (F3-04)', () => {
  it('sin membresías: es un dueño nuevo, va al onboarding', () => {
    expect(resolveAdminAccess([])).toEqual({ kind: 'onboarding' });
  });

  it('solo atleta: no se le crea un gimnasio sin querer, se le explica', () => {
    expect(resolveAdminAccess([membership('athlete')])).toEqual({ kind: 'none' });
  });

  it('owner o admin entran', () => {
    const owner = resolveAdminAccess([membership('owner')]);
    expect(owner.kind).toBe('ready');
    expect(resolveAdminAccess([membership('admin')]).kind).toBe('ready');
  });

  it('el selector solo ofrece los gimnasios donde manda', () => {
    const access = resolveAdminAccess([
      membership('athlete'),
      membership('admin'),
      membership('owner'),
    ]);
    expect(access.kind).toBe('ready');
    if (access.kind !== 'ready') return;
    expect(access.memberships.map((m) => m.role)).toEqual(['admin', 'owner']);
  });

  it('una membresía admin no activa no habilita nada', () => {
    expect(resolveAdminAccess([membership('admin', 'invited')])).toEqual({ kind: 'none' });
    expect(resolveAdminAccess([membership('owner', 'disabled')])).toEqual({ kind: 'none' });
  });

  it('coach todavía no entra al CRM (F3-11 amplía roles)', () => {
    expect(resolveAdminAccess([membership('coach')])).toEqual({ kind: 'none' });
  });
});
