import type { EntryDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { currentRm } from './currentRm';

const entry = (id: string, date: string, kg = 100): EntryDto => ({
  id,
  exerciseId: 'e1',
  kg,
  date,
  createdAt: '2026-07-01T00:00:00.000Z',
});

describe('currentRm (RN-22)', () => {
  it('lista vacía → null', () => {
    expect(currentRm([])).toBeNull();
  });

  it('fechas desordenadas → gana la más reciente', () => {
    const list = [entry('a', '2026-06-10'), entry('b', '2026-06-25'), entry('c', '2026-06-20')];
    expect(currentRm(list)?.id).toBe('b');
  });

  it('empate de fecha → gana el id mayor (creada después)', () => {
    const list = [
      entry('0000000000000000000000a1', '2026-06-25'),
      entry('0000000000000000000000a9', '2026-06-25'),
      entry('0000000000000000000000a5', '2026-06-25'),
    ];
    expect(currentRm(list)?.id).toBe('0000000000000000000000a9');
  });

  it('no muta la lista de entrada', () => {
    const list = [entry('a', '2026-06-10'), entry('b', '2026-06-25')];
    const copy = [...list];
    currentRm(list);
    expect(list).toEqual(copy);
  });
});
