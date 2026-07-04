import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cursorQuery, page } from './pagination.js';

describe('cursorQuery', () => {
  it('applies defaults and coerces limit', () => {
    expect(cursorQuery.parse({})).toEqual({ limit: 25 });
    expect(cursorQuery.parse({ limit: '10' }).limit).toBe(10);
  });
  it('rejects limit out of range and extra fields', () => {
    expect(cursorQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(cursorQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(cursorQuery.safeParse({ skip: 5 }).success).toBe(false);
  });
});

describe('page', () => {
  const numbersPage = page(z.number());
  it('validates items + nextCursor', () => {
    expect(
      numbersPage.safeParse({ items: [1, 2], nextCursor: '507f1f77bcf86cd799439011' }).success,
    ).toBe(true);
    expect(numbersPage.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(numbersPage.safeParse({ items: [], nextCursor: 'nope' }).success).toBe(false);
  });
});
