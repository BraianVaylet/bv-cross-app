import type { EntryDto } from '@bv/contracts';

/**
 * RM/marca vigente (RN-22): la de fecha más reciente; a igualdad de fecha,
 * la creada después (id de ObjectId mayor). Mismo criterio que el orden del
 * server, replicado acá para no depender de que las entries lleguen ordenadas.
 */
export function currentRm(entries: EntryDto[]): EntryDto | null {
  let best: EntryDto | null = null;
  for (const e of entries) {
    if (best === null || e.date > best.date || (e.date === best.date && e.id > best.id)) {
      best = e;
    }
  }
  return best;
}
