import { describe, expect, it } from 'vitest';
import { addDaysYmd, datesBetween, localToUtc, todayInTz, weekdayInTz } from './schedule-time.js';

const AR = 'America/Argentina/Buenos_Aires';
const MADRID = 'Europe/Madrid';

describe('localToUtc — los 3 casos de timezone de F3-01', () => {
  it('caso 1: lunes 18:00 en AR (UTC-3) → 21:00Z del mismo lunes', () => {
    // 2026-06-15 es lunes
    expect(localToUtc('2026-06-15', '18:00', AR).toISOString()).toBe('2026-06-15T21:00:00.000Z');
  });

  it('caso 2: 02:30 del salto de primavera en Madrid → instante determinista, sin crash', () => {
    // 2026-03-29: a las 02:00 los relojes saltan a 03:00 → las 02:30 NO existen.
    // La librería resuelve a 01:30Z (= 03:30 local), de forma estable.
    const result = localToUtc('2026-03-29', '02:30', MADRID);
    expect(result.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // determinismo: dos llamadas dan lo mismo
    expect(localToUtc('2026-03-29', '02:30', MADRID).getTime()).toBe(result.getTime());
    // y el día previo (con horario de invierno, UTC+1) sí conserva las 02:30 locales
    expect(localToUtc('2026-03-28', '02:30', MADRID).toISOString()).toBe('2026-03-28T01:30:00.000Z');
  });

  it('caso 3: domingo 00:30 en AR cae domingo local (lunes 03:30Z)', () => {
    // 2026-06-14 es domingo en AR
    expect(weekdayInTz('2026-06-14', AR)).toBe(0);
    expect(localToUtc('2026-06-14', '00:30', AR).toISOString()).toBe('2026-06-14T03:30:00.000Z');
    // en UTC ese instante ya es domingo 03:30 — el weekday se evaluó en tz org
    expect(new Date('2026-06-14T03:30:00.000Z').getUTCDay()).toBe(0);
  });
});

describe('helpers de calendario', () => {
  it('todayInTz usa la fecha local de la org, no la UTC', () => {
    // 2026-07-20T02:30Z = 2026-07-19 23:30 en AR
    const instant = new Date('2026-07-20T02:30:00.000Z');
    expect(todayInTz(AR, instant)).toBe('2026-07-19');
    expect(todayInTz('UTC', instant)).toBe('2026-07-20');
  });

  it('addDaysYmd cruza fin de mes y año bisiesto', () => {
    expect(addDaysYmd('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29'); // 2028 bisiesto
  });

  it('weekdayInTz es estable alrededor del cambio de DST', () => {
    expect(weekdayInTz('2026-03-29', MADRID)).toBe(0); // domingo del salto
    expect(weekdayInTz('2026-06-15', AR)).toBe(1); // lunes
  });

  it('datesBetween incluye ambos extremos', () => {
    expect(datesBetween('2026-06-15', '2026-06-18')).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ]);
    expect(datesBetween('2026-06-15', '2026-06-15')).toEqual(['2026-06-15']);
  });

  it('rechaza formatos inválidos', () => {
    expect(() => localToUtc('15/06/2026', '18:00', AR)).toThrow(/fecha inválida/);
    expect(() => localToUtc('2026-06-15', '6pm', AR)).toThrow(/hora inválida/);
  });
});
