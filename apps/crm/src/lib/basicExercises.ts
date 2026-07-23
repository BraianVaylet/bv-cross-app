import type { CreateExerciseBody } from '@bv/contracts';

/**
 * Set básico de levantamientos olímpicos y de fuerza (F3-08). "Cargar los 12
 * básicos" los crea de un click para que un box nuevo no arranque con el
 * catálogo vacío. Todos `weight` (kg): son los que se registran con carga.
 */
export const BASIC_EXERCISES: Array<Pick<CreateExerciseBody, 'name' | 'discipline' | 'type'>> = [
  { name: 'Sentadilla trasera', discipline: 'weightlifting', type: 'weight' },
  { name: 'Sentadilla frontal', discipline: 'weightlifting', type: 'weight' },
  { name: 'Peso muerto', discipline: 'weightlifting', type: 'weight' },
  { name: 'Envión (clean)', discipline: 'weightlifting', type: 'weight' },
  { name: 'Arranque (snatch)', discipline: 'weightlifting', type: 'weight' },
  { name: 'Thruster', discipline: 'weightlifting', type: 'weight' },
  { name: 'Press militar', discipline: 'weightlifting', type: 'weight' },
  { name: 'Push press', discipline: 'weightlifting', type: 'weight' },
  { name: 'Split jerk', discipline: 'weightlifting', type: 'weight' },
  { name: 'Hip thrust', discipline: 'strength', type: 'weight' },
  { name: 'Press de banca', discipline: 'strength', type: 'weight' },
  { name: 'Dominadas', discipline: 'gymnastics', type: 'reps' },
];
