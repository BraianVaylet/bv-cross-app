const kgFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** 78.25 -> "78,25" */
export function fmtKg(value: number): string {
  return kgFormatter.format(value);
}

/** "2026-06-10" -> "10/06/2026" */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha local de hoy en formato yyyy-mm-dd (sin sorpresas de timezone). */
export function todayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Redondea al múltiplo más cercano de `step`. Con null devuelve el valor exacto. */
export function roundTo(value: number, step: number | null): number {
  if (!step) return value;
  const result = Math.round(value / step) * step;
  // Corrige residuos binarios (ej: 56.25000000000001)
  return Math.round(result * 100) / 100;
}

/** Peso para un porcentaje del RM. */
export function percentWeight(rmKg: number, pct: number): number {
  return (rmKg * pct) / 100;
}

/** Parsea el RM ingresado (acepta coma o punto). Null si no es un número > 0. */
export function parseRm(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parsea repeticiones: entero > 0. Null si no es válido. */
export function parseReps(value: string): number | null {
  const n = Number(value.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}
