/**
 * Definición de PR (récord personal) del producto — F3-09.
 *
 * Un registro es PR si su valor es **estrictamente mayor** que el máximo
 * previo del mismo par `(userId, exerciseId)`. La primera carga de un par
 * siempre cuenta: no hay marca anterior que superar.
 *
 * El "estrictamente" es la parte que importa: igualar una marca no es un PR.
 * Si alguien levanta 70 kg dos veces, la segunda no vuelve a festejarse — el
 * feed del gimnasio se llenaría de repeticiones y dejaría de significar algo.
 *
 * Ojo con RN-22: el **RM vigente** es el de fecha más reciente, no el mayor.
 * Son dos preguntas distintas y esta función responde solo la del PR.
 */

/** Lo mínimo que necesita la regla: el valor medido y su orden cronológico. */
export interface PrCandidate {
  /** kg o reps, según el tipo del ejercicio. Una sola medida por registro (RN-23). */
  value: number;
}

/**
 * Marca cuáles de una serie YA ORDENADA cronológicamente son PR.
 * Devuelve, por cada entrada, si es PR y cuánto mejoró la marca anterior
 * (`null` en el primer registro: no hay contra qué comparar).
 */
export function markPrs<T extends PrCandidate>(
  chronological: T[],
): Array<T & { isPr: boolean; improvement: number | null }> {
  let best: number | null = null;
  return chronological.map((entry) => {
    const isPr = best === null || entry.value > best;
    const improvement = isPr && best !== null ? Math.round((entry.value - best) * 100) / 100 : null;
    if (isPr) best = entry.value;
    return { ...entry, isPr, improvement };
  });
}

/** El valor medido de un registro: kg o reps, lo que tenga (RN-23). */
export const measureOf = (entry: { kg?: number; reps?: number }): number => entry.kg ?? entry.reps ?? 0;
