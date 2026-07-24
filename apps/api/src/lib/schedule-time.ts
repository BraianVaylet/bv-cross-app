import { TZDate } from '@date-fns/tz';

/**
 * Conversiones de fecha/hora para la agenda (docs/02-arquitectura.md §7).
 *
 * Reglas que este módulo hace cumplir:
 * - Se persiste SIEMPRE en UTC; la hora local solo existe en el template.
 * - La conversión usa la timezone de la org **en esa fecha concreta**, así que
 *   los saltos de DST salen bien sin asumir un offset fijo.
 * - El "día de calendario" y el weekday se evalúan en la tz de la org, nunca
 *   en UTC (si no, una clase del domingo 00:30 AR caería en lunes).
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM = /^(\d{2}):(\d{2})$/;

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`fecha inválida: ${ymd} (se espera YYYY-MM-DD)`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseHm(hm: string): { hour: number; minute: number } {
  const m = HM.exec(hm);
  if (!m) throw new Error(`hora inválida: ${hm} (se espera HH:mm)`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * "2026-06-15" + "18:00" en `America/Argentina/Buenos_Aires` → 2026-06-15T21:00:00Z.
 *
 * DST: si la hora local no existe (salto de primavera, p. ej. 02:30 del
 * 2026-03-29 en Europe/Madrid) la librería resuelve de forma determinista al
 * instante equivalente (01:30Z = 03:30 local). No se lanza error: la sesión se
 * crea corrida, que es preferible a dejar un hueco silencioso en la grilla.
 */
export function localToUtc(ymd: string, hm: string, timeZone: string): Date {
  const { year, month, day } = parseYmd(ymd);
  const { hour, minute } = parseHm(hm);
  const local = new TZDate(year, month - 1, day, hour, minute, 0, timeZone);
  return new Date(local.getTime());
}

/** Fecha de calendario (YYYY-MM-DD) de `now` en la timezone dada. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma días a una fecha de calendario, sin tocar horas ni timezone. */
export function addDaysYmd(ymd: string, days: number): string {
  const { year, month, day } = parseYmd(ymd);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Último instante de un día de calendario en la timezone de la org
 * (23:59:59.999 local). Lo usa el vencimiento de packs (RN-18): la vigencia
 * cubre el día completo, así que un pack que vence "el 31" sirve hasta que
 * termine el 31 en el gimnasio, no a las 00:00 UTC.
 */
export function endOfDayInTz(ymd: string, timeZone: string): Date {
  const startOfNextDay = localToUtc(addDaysYmd(ymd, 1), '00:00', timeZone);
  return new Date(startOfNextDay.getTime() - 1);
}

/** Día de la semana (0=domingo) de una fecha de calendario en la tz de la org. */
export function weekdayInTz(ymd: string, timeZone: string): number {
  const { year, month, day } = parseYmd(ymd);
  // Mediodía local: lejos de cualquier salto de DST, así el día no se corre.
  return new TZDate(year, month - 1, day, 12, 0, 0, timeZone).getDay();
}

/**
 * Semana en curso, lunes a domingo, evaluada en la tz de la org (F3-10).
 *
 * Lunes y no domingo porque es la semana del gimnasio: la grilla arranca el
 * lunes (RN-05) y el dueño compara "esta semana" contra esa misma ventana.
 */
export function weekRangeInTz(timeZone: string, now: Date = new Date()): { from: string; to: string } {
  const hoy = todayInTz(timeZone, now);
  const dow = weekdayInTz(hoy, timeZone); // 0=domingo
  const from = addDaysYmd(hoy, -((dow + 6) % 7)); // domingo retrocede 6, lunes 0
  return { from, to: addDaysYmd(from, 6) };
}

/** Mes calendario en curso en la tz de la org (F3-10). */
export function monthRangeInTz(timeZone: string, now: Date = new Date()): { from: string; to: string } {
  const hoy = todayInTz(timeZone, now);
  const from = `${hoy.slice(0, 7)}-01`;
  const { year, month } = parseYmd(from);
  // Día 0 del mes siguiente = último del actual, sin tabla de días por mes.
  const ultimo = new Date(Date.UTC(year, month, 0));
  return { from, to: ultimo.toISOString().slice(0, 10) };
}

/**
 * Instantes UTC que abarcan [from, to] completo en la tz de la org.
 * `to` es inclusivo: cubre hasta el último milisegundo de ese día local.
 */
export function utcBounds(
  from: string,
  to: string,
  timeZone: string,
): { start: Date; end: Date } {
  return { start: localToUtc(from, '00:00', timeZone), end: endOfDayInTz(to, timeZone) };
}

/** Días de calendario entre dos fechas YYYY-MM-DD (`to - from`). */
export function daysBetweenYmd(from: string, to: string): number {
  const a = parseYmd(from);
  const b = parseYmd(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/** Todas las fechas de calendario en [from, to] (inclusive). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}
