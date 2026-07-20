import { describe, expect, it } from 'vitest';
import { createEntryBody, entriesQuery, entryDto } from './entries.js';

const ID = '0123456789abcdef01234567';

describe('createEntryBody', () => {
  it('XOR: exactamente una medida', () => {
    expect(createEntryBody.parse({ exerciseId: ID, kg: 100, date: '2026-07-01' }).kg).toBe(100);
    expect(createEntryBody.parse({ exerciseId: ID, reps: 10, date: '2026-07-01' }).reps).toBe(10);
    expect(() => createEntryBody.parse({ exerciseId: ID, date: '2026-07-01' })).toThrow();
    expect(() =>
      createEntryBody.parse({ exerciseId: ID, kg: 100, reps: 10, date: '2026-07-01' }),
    ).toThrow();
  });

  it('rangos: kg 0.5..600 hasta 2 decimales; reps entero 1..500', () => {
    expect(createEntryBody.parse({ exerciseId: ID, kg: 102.25, date: '2026-07-01' }).kg).toBe(102.25);
    expect(() => createEntryBody.parse({ exerciseId: ID, kg: 0.4, date: '2026-07-01' })).toThrow();
    expect(() => createEntryBody.parse({ exerciseId: ID, kg: 600.5, date: '2026-07-01' })).toThrow();
    expect(() => createEntryBody.parse({ exerciseId: ID, kg: 100.555, date: '2026-07-01' })).toThrow();
    expect(() => createEntryBody.parse({ exerciseId: ID, reps: 2.5, date: '2026-07-01' })).toThrow();
    expect(() => createEntryBody.parse({ exerciseId: ID, reps: 0, date: '2026-07-01' })).toThrow();
    expect(() => createEntryBody.parse({ exerciseId: ID, reps: 501, date: '2026-07-01' })).toThrow();
  });

  it('fecha de calendario real; comment ≤300; strict', () => {
    expect(() => createEntryBody.parse({ exerciseId: ID, kg: 100, date: '2026-02-30' })).toThrow();
    expect(() =>
      createEntryBody.parse({ exerciseId: ID, kg: 100, date: '2026-07-01', comment: 'x'.repeat(301) }),
    ).toThrow();
    expect(() =>
      createEntryBody.parse({ exerciseId: ID, kg: 100, date: '2026-07-01', orgId: ID }),
    ).toThrow();
  });
});

describe('entriesQuery / entryDto', () => {
  it('query con defaults y exerciseId opcional', () => {
    const q = entriesQuery.parse({});
    expect(q.limit).toBe(25);
    expect(entriesQuery.parse({ exerciseId: ID }).exerciseId).toBe(ID);
  });

  it('dto rechaza filtración de userId/orgId internos', () => {
    const dto = {
      id: ID,
      exerciseId: ID,
      kg: 100,
      date: '2026-07-01',
      createdAt: '2026-07-01T12:00:00.000Z',
    };
    expect(entryDto.parse(dto).kg).toBe(100);
    expect(() => entryDto.parse({ ...dto, userId: ID })).toThrow();
    expect(() => entryDto.parse({ ...dto, orgId: ID })).toThrow();
  });
});
