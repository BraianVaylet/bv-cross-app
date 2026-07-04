import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorEnvelope, httpStatusFor } from './errors.js';

describe('error catalog', () => {
  it('every code maps to a valid HTTP status', () => {
    for (const [code, status] of Object.entries(ERROR_CODES)) {
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThanOrEqual(599);
    }
  });

  it('httpStatusFor resolves known codes', () => {
    expect(httpStatusFor('SESSION_FULL')).toBe(409);
    expect(httpStatusFor('TOKEN_EXPIRED')).toBe(401);
    expect(httpStatusFor('RATE_LIMITED')).toBe(429);
  });
});

describe('errorEnvelope', () => {
  it('accepts the canonical shape', () => {
    const parsed = errorEnvelope.safeParse({
      error: { code: 'NO_CREDITS', message: 'No tenés clases disponibles.' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown codes and extra fields (.strict)', () => {
    expect(
      errorEnvelope.safeParse({ error: { code: 'NOPE', message: 'x' } }).success,
    ).toBe(false);
    expect(
      errorEnvelope.safeParse({
        error: { code: 'INTERNAL', message: 'x', stack: 'leak' },
      }).success,
    ).toBe(false);
    expect(
      errorEnvelope.safeParse({
        error: { code: 'INTERNAL', message: 'x' },
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
