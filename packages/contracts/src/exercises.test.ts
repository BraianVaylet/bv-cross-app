import { describe, expect, it } from 'vitest';
import { createExerciseBody, exerciseDto, exercisesQuery, updateExerciseBody } from './exercises.js';

const ID = '0123456789abcdef01234567';

describe('createExerciseBody', () => {
  it('acepta el mínimo y defaultea scope personal', () => {
    const parsed = createExerciseBody.parse({ name: 'Back Squat', type: 'weight' });
    expect(parsed.scope).toBe('personal');
  });

  it('trimea el nombre y rechaza vacío, >80, type inválido y http', () => {
    expect(createExerciseBody.parse({ name: '  Squat ', type: 'reps' }).name).toBe('Squat');
    expect(() => createExerciseBody.parse({ name: '   ', type: 'weight' })).toThrow();
    expect(() => createExerciseBody.parse({ name: 'x'.repeat(81), type: 'weight' })).toThrow();
    expect(() => createExerciseBody.parse({ name: 'Squat', type: 'cardio' })).toThrow();
    expect(() =>
      createExerciseBody.parse({ name: 'Squat', type: 'weight', imageUrl: 'http://a.com/i.png' }),
    ).toThrow();
  });

  it('rechaza campos extra (strict)', () => {
    expect(() =>
      createExerciseBody.parse({ name: 'Squat', type: 'weight', archivedAt: 'x' }),
    ).toThrow();
  });
});

describe('updateExerciseBody', () => {
  it('permite null para limpiar opcionales pero no en name/type', () => {
    const parsed = updateExerciseBody.parse({ discipline: null, notes: null });
    expect(parsed.discipline).toBeNull();
    expect(() => updateExerciseBody.parse({ name: null })).toThrow();
    expect(() => updateExerciseBody.parse({ type: null })).toThrow();
  });
});

describe('exercisesQuery', () => {
  it('defaults: scope all, includeArchived false; "1" → true', () => {
    const def = exercisesQuery.parse({});
    expect(def.scope).toBe('all');
    expect(def.includeArchived).toBe(false);
    expect(exercisesQuery.parse({ includeArchived: '1' }).includeArchived).toBe(true);
    expect(() => exercisesQuery.parse({ scope: 'global' })).toThrow();
  });
});

describe('exerciseDto', () => {
  it('valida el DTO completo y rechaza filtraciones internas (orgId/ownerUserId)', () => {
    const dto = {
      id: ID,
      scope: 'org',
      name: 'Back Squat',
      type: 'weight',
      createdAt: '2026-07-19T12:00:00.000Z',
      updatedAt: '2026-07-19T12:00:00.000Z',
    };
    expect(exerciseDto.parse(dto).scope).toBe('org');
    expect(() => exerciseDto.parse({ ...dto, orgId: ID })).toThrow();
    expect(() => exerciseDto.parse({ ...dto, ownerUserId: ID })).toThrow();
  });
});
