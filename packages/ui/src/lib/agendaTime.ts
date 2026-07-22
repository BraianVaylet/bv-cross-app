/**
 * Aritmética de fechas de agenda para los FEs (F4-04).
 *
 * Regla del proyecto (docs/02-arquitectura.md §7): las horas se muestran SIEMPRE
 * en la timezone del gimnasio, nunca en la del teléfono — un atleta de viaje
 * tiene que ver el horario de su box. Todo lo que agrupe o formatee sesiones en
 * cualquier app (agenda y CRM, F3-06) sale de acá: un solo lugar, un solo bug
 * posible. El equivalente del servidor vive en `apps/api/src/lib/schedule-time.ts`.
 *
 * Las fechas de calendario viajan como `YYYY-MM-DD` y su aritmética se hace en
 * UTC a propósito: sumar días sobre un `Date` local se rompe con el horario de
 * verano, sobre el mediodía UTC de una fecha pelada no.
 */

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function ymdFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = ymdFormatters.get(timeZone);
  if (!fmt) {
    // en-CA da exactamente YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    ymdFormatters.set(timeZone, fmt);
  }
  return fmt;
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = timeFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23', // 00:30, nunca 24:30
    });
    timeFormatters.set(timeZone, fmt);
  }
  return fmt;
}

const toDate = (instant: Date | string): Date =>
  instant instanceof Date ? instant : new Date(instant);

/** Fecha de calendario (`YYYY-MM-DD`) de un instante, en la tz de la org. */
export function ymdInTz(instant: Date | string, timeZone: string): string {
  return ymdFormatter(timeZone).format(toDate(instant));
}

/** Hora `HH:mm` de un instante, en la tz de la org. */
export function timeInTz(instant: Date | string, timeZone: string): string {
  return timeFormatter(timeZone).format(toDate(instant));
}

/** Hoy en la tz de la org (no en la del dispositivo). */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return ymdInTz(now, timeZone);
}

export function addDaysYmd(ymd: string, days: number): string {
  const base = Date.parse(`${ymd}T12:00:00Z`); // mediodía: inmune a DST
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Días entre dos fechas de calendario (b - a). */
export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Lunes de la semana de `ymd` (semana lunes→domingo, como la grilla del box). */
export function startOfWeekYmd(ymd: string): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  const weekday = date.getUTCDay(); // 0=domingo
  return addDaysYmd(ymd, weekday === 0 ? -6 : 1 - weekday);
}

/** Las 7 fechas de la semana que arranca en `startYmd`. */
export function weekDays(startYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(startYmd, i));
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Etiqueta corta de la pestaña de día: `{ weekday: 'Lun', day: '7' }`. */
export function dayLabel(ymd: string): { weekday: string; day: string } {
  const date = new Date(`${ymd}T12:00:00Z`);
  return {
    weekday: WEEKDAY_LABELS[date.getUTCDay()] ?? '',
    day: String(date.getUTCDate()),
  };
}

/**
 * Agrupa por día de calendario DE LA ORG. Acá vive el caso que rompe todo si
 * se usa la fecha del dispositivo: una clase de las 23:30 en Buenos Aires es
 * `02:30Z` del día siguiente — pertenece al día anterior para el atleta.
 */
export function groupByDayInTz<T extends { startsAt: string }>(
  items: T[],
  timeZone: string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const day = ymdInTz(item.startsAt, timeZone);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return byDay;
}
