import { describe, expect, it } from 'vitest';
import { markPrs, measureOf } from './pr-rule.js';

/**
 * La definición de PR queda fijada acá: es la referencia para las stats que
 * vengan después (F5-01/02), así que los bordes van explícitos.
 */
const prsOf = (values: number[]): number[] =>
  markPrs(values.map((value) => ({ value })))
    .filter((e) => e.isPr)
    .map((e) => e.value);

describe('definición de PR (F3-09)', () => {
  it('la secuencia del ejemplo: 60, 70, 65, 70, 72.5 → PRs en 60, 70 y 72.5', () => {
    expect(prsOf([60, 70, 65, 70, 72.5])).toEqual([60, 70, 72.5]);
  });

  it('igualar una marca NO es PR: el feed dejaría de significar algo', () => {
    expect(prsOf([100, 100, 100])).toEqual([100]);
  });

  it('la primera carga siempre es PR: no hay marca anterior que superar', () => {
    expect(prsOf([42])).toEqual([42]);
    expect(markPrs([{ value: 42 }])[0]?.improvement).toBeNull();
  });

  it('bajar y volver a subir sin superar el récord no cuenta', () => {
    expect(prsOf([100, 80, 90, 99.5])).toEqual([100]);
  });

  it('cada PR informa cuánto mejoró la marca anterior', () => {
    const marcados = markPrs([{ value: 60 }, { value: 70 }, { value: 72.5 }]);
    expect(marcados.map((e) => e.improvement)).toEqual([null, 10, 2.5]);
  });

  it('sin registros no hay PRs', () => {
    expect(markPrs([])).toEqual([]);
  });

  it('funciona igual con repeticiones: la regla no mira la unidad', () => {
    expect(prsOf([10, 12, 12, 15])).toEqual([10, 12, 15]);
  });

  it('la mejora se redondea a 2 decimales (los kg tienen 2, RN-23)', () => {
    const marcados = markPrs([{ value: 60.1 }, { value: 60.3 }]);
    expect(marcados[1]?.improvement).toBe(0.2); // no 0.19999999999999574
  });
});

describe('measureOf', () => {
  it('devuelve la única medida que tiene el registro (RN-23)', () => {
    expect(measureOf({ kg: 80 })).toBe(80);
    expect(measureOf({ reps: 12 })).toBe(12);
  });
});
