import type { ExerciseDto } from '@bv/contracts';

export interface ExerciseGroups {
  /** Catálogo activo de la org (visible, editable solo por el gym). */
  catalog: ExerciseDto[];
  /** Ejercicios personales del atleta (CRUD completo). */
  personal: ExerciseDto[];
  /** Catálogo archivado por el gym (solo lectura, RN-19). */
  archived: ExerciseDto[];
}

/**
 * Separa el listado en las tres secciones de la Home (F2-05). Los personales
 * nunca se archivan; solo el catálogo de la org tiene estado archivado.
 * `query` filtra por nombre (case-insensitive) en las tres secciones a la vez.
 */
export function groupExercises(exercises: ExerciseDto[], query = ''): ExerciseGroups {
  const needle = query.trim().toLowerCase();
  const groups: ExerciseGroups = { catalog: [], personal: [], archived: [] };
  for (const e of exercises) {
    if (needle && !e.name.toLowerCase().includes(needle)) continue;
    if (e.scope === 'personal') groups.personal.push(e);
    else if (e.archivedAt) groups.archived.push(e);
    else groups.catalog.push(e);
  }
  return groups;
}
