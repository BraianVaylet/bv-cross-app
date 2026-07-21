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

/** Día de la semana (0=domingo) de una fecha de calendario en la tz de la org. */
export function weekdayInTz(ymd: string, timeZone: string): number {
  const { year, month, day } = parseYmd(ymd);
  // Mediodía local: lejos de cualquier salto de DST, así el día no se corre.
  return new TZDate(year, month - 1, day, 12, 0, 0, timeZone).getDay();
}

/** Todas las fechas de calendario en [from, to] (inclusive). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}
