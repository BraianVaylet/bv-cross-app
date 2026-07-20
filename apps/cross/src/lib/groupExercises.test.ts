import type { ExerciseDto } from '@bv/contracts';
import { describe, expect, it } from 'vitest';
import { groupExercises } from './groupExercises';

const ex = (id: string, name: string, scope: 'org' | 'personal', archived = false): ExerciseDto => ({
  id,
  scope,
  name,
  type: 'weight',
  ...(archived ? { archivedAt: '2026-07-01T00:00:00.000Z' } : {}),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('groupExercises', () => {
  const list = [
    ex('1', 'Back Squat', 'org'),
    ex('2', 'Snatch viejo', 'org', true),
    ex('3', 'Mi Curl', 'personal'),
    ex('4', 'Deadlift', 'org'),
  ];

  it('separa en 3 buckets: catálogo activo, personal, archivado', () => {
    const g = groupExercises(list);
    expect(g.catalog.map((e) => e.id)).toEqual(['1', '4']);
    expect(g.personal.map((e) => e.id)).toEqual(['3']);
    expect(g.archived.map((e) => e.id)).toEqual(['2']);
  });

  it('la búsqueda filtra las tres secciones a la vez (case-insensitive)', () => {
    expect(groupExercises(list, 'sq').catalog.map((e) => e.id)).toEqual(['1']);
    expect(groupExercises(list, 'VIEJO').archived.map((e) => e.id)).toEqual(['2']);
    expect(groupExercises(list, 'curl').personal.map((e) => e.id)).toEqual(['3']);
    const empty = groupExercises(list, 'zzz');
    expect([...empty.catalog, ...empty.personal, ...empty.archived]).toEqual([]);
  });
});
