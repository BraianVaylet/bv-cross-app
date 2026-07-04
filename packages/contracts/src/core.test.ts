import { describe, expect, it } from 'vitest';
import { calendarDate, email, joinCode, objectIdString } from './core.js';

describe('objectIdString', () => {
  it('accepts 24 hex chars, mixed case', () => {
    expect(objectIdString.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(objectIdString.safeParse('507F1F77BCF86CD799439011').success).toBe(true);
  });
  it('rejects wrong length, non-hex and non-strings', () => {
    expect(objectIdString.safeParse('507f1f77bcf86cd79943901').success).toBe(false);
    expect(objectIdString.safeParse('507f1f77bcf86cd79943901z').success).toBe(false);
    expect(objectIdString.safeParse(null).success).toBe(false);
    expect(objectIdString.safeParse(42).success).toBe(false);
  });
});

describe('email', () => {
  it('normalizes trim + lowercase', () => {
    expect(email.parse(' Foo@BAR.com ')).toBe('foo@bar.com');
  });
  it('rejects invalid and too long', () => {
    expect(email.safeParse('sin-arroba').success).toBe(false);
    expect(email.safeParse(`${'a'.repeat(250)}@x.com`).success).toBe(false);
  });
});

describe('calendarDate', () => {
  it('accepts real dates', () => {
    expect(calendarDate.safeParse('2026-07-04').success).toBe(true);
    expect(calendarDate.safeParse('2024-02-29').success).toBe(true); // bisiesto
  });
  it('rejects nonexistent dates and bad formats', () => {
    expect(calendarDate.safeParse('2026-02-30').success).toBe(false);
    expect(calendarDate.safeParse('2026-13-01').success).toBe(false);
    expect(calendarDate.safeParse('2023-02-29').success).toBe(false); // no bisiesto
    expect(calendarDate.safeParse('04/07/2026').success).toBe(false);
  });
});

describe('joinCode (RN-01)', () => {
  it('normalizes to lowercase', () => {
    expect(joinCode.parse(' BAHIA-Cross-x9k2 ')).toBe('bahia-cross-x9k2');
  });
  it('rejects out-of-format codes', () => {
    expect(joinCode.safeParse('abc').success).toBe(false); // < 4
    expect(joinCode.safeParse('a'.repeat(33)).success).toBe(false); // > 32
    expect(joinCode.safeParse('con espacios').success).toBe(false);
    expect(joinCode.safeParse('tildé-ñ').success).toBe(false);
  });
});
