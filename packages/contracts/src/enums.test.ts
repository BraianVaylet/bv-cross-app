import { describe, expect, it } from 'vitest';
import {
  bookingStatus,
  exerciseScope,
  exerciseType,
  membershipStatus,
  orgStatus,
  packAssignmentStatus,
  paymentMethod,
  role,
  sessionStatus,
} from './enums.js';

// Snapshot literal de los valores del dominio (docs/02-arquitectura.md §4).
// Si este test falla, alguien cambió un valor publicado: eso es breaking + migración.
describe('domain enums are frozen', () => {
  it('keeps exact published values', () => {
    expect(role.options).toEqual(['owner', 'admin', 'coach', 'athlete']);
    expect(membershipStatus.options).toEqual(['invited', 'active', 'disabled']);
    expect(exerciseType.options).toEqual(['weight', 'reps']);
    expect(exerciseScope.options).toEqual(['org', 'personal']);
    expect(packAssignmentStatus.options).toEqual(['active', 'exhausted', 'expired', 'cancelled']);
    expect(bookingStatus.options).toEqual([
      'booked',
      'cancelled_by_user',
      'cancelled_by_gym',
      'attended',
      'no_show',
    ]);
    expect(paymentMethod.options).toEqual(['cash', 'debit', 'transfer', 'other']);
    expect(sessionStatus.options).toEqual(['scheduled', 'cancelled']);
    expect(orgStatus.options).toEqual(['active', 'suspended']);
  });
});
