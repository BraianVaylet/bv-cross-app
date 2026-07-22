import type { AssignmentDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { packSummary } from './packSummary';

const AR = 'America/Argentina/Buenos_Aires';
const NOW = new Date('2026-07-01T15:00:00.000Z');

const assignment = (over: Partial<AssignmentDto> = {}): AssignmentDto => ({
  id: 'a1',
  packId: 'p1',
  userId: 'u1',
  snapshot: {
    name: '8 clases',
    classCount: 8,
    durationDays: 30,
    price: 25_000,
    currency: 'ARS',
    paymentMethod: 'cash',
  },
  startsAt: '2026-06-15T00:00:00.000Z',
  expiresAt: '2026-07-12T23:59:59.999Z',
  classesUsed: 3,
  remaining: 5,
  status: 'active',
  payment: { amount: 25_000, method: 'cash', paidAt: '2026-06-15T00:00:00.000Z' },
  createdAt: '2026-06-15T00:00:00.000Z',
  ...over,
});

describe('packSummary (F3-05)', () => {
  it('muestra saldo y vencimiento del pack que se consume primero', () => {
    expect(packSummary([assignment()], AR, NOW)).toBe('5/8 · vence 12/07');
  });

  it('con varios activos elige el que vence antes, no el primero de la lista', () => {
    const summary = packSummary(
      [
        assignment({ id: 'lejano', expiresAt: '2026-08-20T23:59:59.999Z', remaining: 12 }),
        assignment({ id: 'proximo', expiresAt: '2026-07-05T23:59:59.999Z', remaining: 2 }),
      ],
      AR,
      NOW,
    );
    expect(summary).toBe('2/8 · vence 05/07');
  });

  it('sin packs usables devuelve null (la tabla muestra "—")', () => {
    expect(packSummary([], AR, NOW)).toBeNull();
    expect(packSummary([assignment({ status: 'expired' })], AR, NOW)).toBeNull();
    expect(packSummary([assignment({ status: 'cancelled' })], AR, NOW)).toBeNull();
    // Agotado: sigue 'active' en la DB hasta que lo barra el job, pero no sirve.
    expect(packSummary([assignment({ remaining: 0, classesUsed: 8 })], AR, NOW)).toBeNull();
  });

  it('un pack vencido que el job todavía no marcó tampoco cuenta', () => {
    const vencido = assignment({ expiresAt: '2026-06-30T23:59:59.999Z', status: 'active' });
    expect(packSummary([vencido], AR, NOW)).toBeNull();
  });

  it('la fecha se lee en la tz del gimnasio', () => {
    // 12/07 23:59 en Buenos Aires es 13/07 en UTC.
    expect(packSummary([assignment({ expiresAt: '2026-07-13T02:59:00.000Z' })], AR, NOW)).toBe(
      '5/8 · vence 12/07',
    );
  });
});
