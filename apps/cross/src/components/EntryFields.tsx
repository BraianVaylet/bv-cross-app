import type { CreateEntryBody, ExerciseType } from '@bv/contracts';
import { Input, Textarea } from '@bv/ui';
import { parseReps, parseRm } from '../lib/format';

export type EntryFormValues = { kg: string; reps: string; date: string; comment: string };
export type EntryFieldErrors = Partial<Record<'kg' | 'reps' | 'date' | 'comment', string>>;

export const emptyEntryForm = (date: string): EntryFormValues => ({
  kg: '',
  reps: '',
  date,
  comment: '',
});

export type BuiltEntry =
  | { payload: Omit<CreateEntryBody, 'exerciseId'> }
  | { error: EntryFieldErrors };

/** Arma el payload del registro según el tipo del ejercicio (XOR RN-23). */
export function buildEntryPayload(type: ExerciseType, values: EntryFormValues): BuiltEntry {
  const base = { date: values.date, comment: values.comment.trim() || undefined };
  if (type === 'reps') {
    const reps = parseReps(values.reps);
    if (reps === null) return { error: { reps: 'Ingresá un número entero mayor a 0' } };
    return { payload: { ...base, reps } };
  }
  const kg = parseRm(values.kg);
  if (kg === null) return { error: { kg: 'Ingresá un número mayor a 0' } };
  return { payload: { ...base, kg } };
}

/** Campos compartidos para registrar una marca (RM en kg o reps). */
export function EntryFields({
  values,
  onChange,
  errors,
  type,
}: {
  values: EntryFormValues;
  onChange: (values: EntryFormValues) => void;
  errors?: EntryFieldErrors;
  type: ExerciseType;
}) {
  return (
    <div className="space-y-4">
      {type === 'reps' ? (
        <Input
          label="Máximo de repeticiones"
          type="number"
          inputMode="numeric"
          step="1"
          min="1"
          placeholder="Ej: 12"
          required
          value={values.reps}
          onChange={(e) => { onChange({ ...values, reps: e.target.value }); }}
          error={errors?.reps}
        />
      ) : (
        <Input
          label="RM (kg)"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="1"
          placeholder="Ej: 100"
          required
          value={values.kg}
          onChange={(e) => { onChange({ ...values, kg: e.target.value }); }}
          error={errors?.kg}
        />
      )}
      <Input
        label="Fecha"
        type="date"
        required
        value={values.date}
        onChange={(e) => { onChange({ ...values, date: e.target.value }); }}
        error={errors?.date}
      />
      <Textarea
        label="Comentario (opcional)"
        rows={2}
        maxLength={300}
        placeholder="Ej: con cinturón, sin dolor de hombro…"
        value={values.comment}
        onChange={(e) => { onChange({ ...values, comment: e.target.value }); }}
        error={errors?.comment}
      />
    </div>
  );
}
