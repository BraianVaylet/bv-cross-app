import type { AssignmentDto } from '@bv/contracts';
import { shortDate } from '@bv/ui';

/**
 * Resumen de packs de un cliente para la lista (F3-05): el pack ACTIVO que
 * vence primero, que es el que se va a consumir (RN-12) y el que le importa al
 * dueño cuando mira la tabla.
 *
 * `null` = no tiene ninguno usable, y la tabla muestra "—". Un pack agotado o
 * vencido no cuenta: sumaría ruido a la columna que se lee de un vistazo.
 */
export function packSummary(
  assignments: AssignmentDto[],
  timeZone: string,
  now: Date = new Date(),
): string | null {
  const usable = assignments
    .filter(
      (a) =>
        a.status === 'active' &&
        a.remaining > 0 &&
        Date.parse(a.expiresAt) > now.getTime(),
    )
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));

  const next = usable[0];
  if (!next) return null;
  return `${next.remaining}/${next.snapshot.classCount} · vence ${shortDate(next.expiresAt, timeZone)}`;
}
