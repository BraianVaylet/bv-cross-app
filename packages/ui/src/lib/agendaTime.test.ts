import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  cancellationDeadline,
  dayLabel,
  daysBetweenYmd,
  expiryLabel,
  groupByDayInTz,
  isCancellable,
  shortDate,
  startOfWeekYmd,
  timeInTz,
  todayInTz,
  weekDays,
  ymdInTz,
} from './agendaTime.js';

const AR = 'America/Argentina/Buenos_Aires'; // UTC-3, sin DST
const MADRID = 'Europe/Madrid'; // UTC+1/+2, con DST

describe('agendaTime: la hora es la del gimnasio, no la del teléfono', () => {
  it('una clase de 23:30 en AR cae el día anterior al UTC (el caso que rompe todo)', () => {
    const instant = '2026-07-23T02:30:00.000Z'; // 23:30 del 22 en Buenos Aires
    expect(ymdInTz(instant, AR)).toBe('2026-07-22');
    expect(timeInTz(instant, AR)).toBe('23:30');
    // El mismo instante, mirado desde otra tz, es otro día y otra hora.
    expect(ymdInTz(instant, MADRID)).toBe('2026-07-23');
    expect(timeInTz(instant, MADRID)).toBe('04:30');
  });

  it('agrupa por día de la org: la de 23:30 no se va al día siguiente', () => {
    const sessions = [
      { id: 'tarde', startsAt: '2026-07-22T21:00:00.000Z' }, // 18:00 AR
      { id: 'noche', startsAt: '2026-07-23T02:30:00.000Z' }, // 23:30 AR del 22
      { id: 'manana', startsAt: '2026-07-23T11:30:00.000Z' }, // 08:30 AR del 23
    ];
    const byDay = groupByDayInTz(sessions, AR);

    expect([...byDay.keys()].sort()).toEqual(['2026-07-22', '2026-07-23']);
    expect(byDay.get('2026-07-22')?.map((s) => s.id)).toEqual(['tarde', 'noche']); // ordenadas por hora
    expect(byDay.get('2026-07-23')?.map((s) => s.id)).toEqual(['manana']);
  });

  it('medianoche exacta pertenece al día que arranca', () => {
    expect(ymdInTz('2026-07-22T03:00:00.000Z', AR)).toBe('2026-07-22'); // 00:00 AR
    expect(timeInTz('2026-07-22T03:00:00.000Z', AR)).toBe('00:00');
  });

  it('todayInTz mira la tz de la org, no la del proceso', () => {
    const now = new Date('2026-07-23T02:30:00.000Z');
    expect(todayInTz(AR, now)).toBe('2026-07-22');
    expect(todayInTz('UTC', now)).toBe('2026-07-23');
  });
});

describe('agendaTime: ventana de cancelación (RN-08, espejo del servidor)', () => {
  const clase = '2026-07-22T21:00:00.000Z'; // 18:00 AR

  it('ventana de 2 h sobre una clase de 18:00 AR → límite 16:00 AR', () => {
    const deadline = cancellationDeadline(clase, 2);
    expect(deadline.toISOString()).toBe('2026-07-22T19:00:00.000Z');
    expect(timeInTz(deadline, AR)).toBe('16:00');
  });

  it('ventana 0 → el límite es el arranque de la clase', () => {
    expect(cancellationDeadline(clase, 0).toISOString()).toBe(clase);
  });

  it('el borde exacto todavía cancela (regla `>=`, igual que la API)', () => {
    const deadline = cancellationDeadline(clase, 2);
    expect(isCancellable(clase, 2, deadline)).toBe(true);
    expect(isCancellable(clase, 2, new Date(deadline.getTime() - 1))).toBe(true);
    expect(isCancellable(clase, 2, new Date(deadline.getTime() + 1))).toBe(false);
  });
});

describe('agendaTime: vencimientos en palabras', () => {
  const AHORA = new Date('2026-07-22T15:00:00.000Z'); // 12:00 AR

  it('hoy, mañana, ayer y los plurales', () => {
    expect(expiryLabel('2026-07-22T23:00:00.000Z', AR, AHORA)).toBe('vence hoy');
    expect(expiryLabel('2026-07-23T20:00:00.000Z', AR, AHORA)).toBe('vence mañana');
    expect(expiryLabel('2026-07-21T20:00:00.000Z', AR, AHORA)).toBe('venció ayer');
    expect(expiryLabel('2026-08-03T20:00:00.000Z', AR, AHORA)).toBe('en 12 días');
    expect(expiryLabel('2026-07-19T20:00:00.000Z', AR, AHORA)).toBe('venció hace 3 días');
  });

  it('el borde se cuenta en la tz de la org, no en UTC', () => {
    // 23:30 del 22 en AR es el 23 en UTC: para el atleta vence HOY.
    expect(expiryLabel('2026-07-23T02:30:00.000Z', AR, AHORA)).toBe('vence hoy');
    // El mismo instante, en Madrid, ya es mañana.
    expect(expiryLabel('2026-07-23T02:30:00.000Z', MADRID, AHORA)).toBe('vence mañana');
  });

  it('fecha corta dd/mm en la tz de la org', () => {
    expect(shortDate('2026-08-02T02:59:00.000Z', AR)).toBe('01/08');
  });
});

describe('agendaTime: aritmética de fechas de calendario', () => {
  it('suma días cruzando fin de mes y año bisiesto', () => {
    expect(addDaysYmd('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysYmd('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('sumar días no se desarma con el horario de verano', () => {
    // Madrid cambia de hora el 29/03/2026: sumar 1 día tiene que dar el 29,
    // no "el 28 otra vez" ni saltar al 30.
    expect(addDaysYmd('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysYmd('2026-03-29', 1)).toBe('2026-03-30');
    expect(daysBetweenYmd('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenYmd('2026-07-22', '2026-07-22')).toBe(0);
  });

  it('la semana arranca el lunes', () => {
    expect(startOfWeekYmd('2026-07-22')).toBe('2026-07-20'); // miércoles → lunes
    expect(startOfWeekYmd('2026-07-20')).toBe('2026-07-20'); // lunes → él mismo
    expect(startOfWeekYmd('2026-07-26')).toBe('2026-07-20'); // domingo → lunes previo
    expect(weekDays('2026-07-20')).toHaveLength(7);
    expect(weekDays('2026-07-20').at(-1)).toBe('2026-07-26');
  });

  it('etiquetas de pestaña en español', () => {
    expect(dayLabel('2026-07-20')).toEqual({ weekday: 'Lun', day: '20' });
    expect(dayLabel('2026-07-26')).toEqual({ weekday: 'Dom', day: '26' });
  });
});
