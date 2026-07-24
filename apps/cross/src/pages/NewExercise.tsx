import { Button, ErrorBanner, Input, Textarea } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../api/endpoints';
import { BackLink } from '../components/BackLink';
import {
  EntryFields,
  buildEntryPayload,
  emptyEntryForm,
  type EntryFormValues,
} from '../components/EntryFields';
import { todayISO } from '../lib/format';

/** Alta de ejercicio personal (los del catálogo los crea el gym en el CRM). */
export function NewExercise() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [isReps, setIsReps] = useState(false);
  const [entry, setEntry] = useState<EntryFormValues>(emptyEntryForm(todayISO()));
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const type = isReps ? ('reps' as const) : ('weight' as const);
    const hasMark = isReps ? entry.reps.trim() !== '' : entry.kg.trim() !== '';
    const built = hasMark ? buildEntryPayload(type, entry) : null;
    if (built && 'error' in built) {
      setErrors(built.error);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const { exercise } = await api.exercises.create({
        name: name.trim(),
        type,
        scope: 'personal',
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (built && 'payload' in built) {
        await api.entries.create({ exerciseId: exercise.id, ...built.payload });
      }
      void navigate(`/exercises/${exercise.id}`, { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(fields);
      if (Object.keys(fields).length === 0) setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackLink to="/">Ejercicios</BackLink>
      <h1 className="font-display text-2xl font-semibold text-ink">Nuevo ejercicio</h1>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Input
          label="Nombre"
          placeholder="Ej: Clean, Back squat, Muscle-up…"
          required
          maxLength={80}
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          error={errors.name}
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
            checked={isReps}
            onChange={(e) => { setIsReps(e.target.checked); }}
          />
          <span>
            <span className="block text-sm font-medium text-ink">Ejercicio de repeticiones</span>
            <span className="block text-xs text-ink-dim">
              Sin cálculo de cargas: registra el máximo de reps (gimnásticos, HSPU, pull-ups…).
            </span>
          </span>
        </label>

        <EntryFields
          values={entry}
          onChange={setEntry}
          errors={errors}
          type={isReps ? 'reps' : 'weight'}
        />

        <Textarea
          label="Notas (opcional)"
          placeholder="Ej: cuidar el hombro, mantener escápulas activas…"
          maxLength={500}
          rows={3}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); }}
        />

        <Button type="submit" full size="lg" loading={loading}>
          Guardar ejercicio
        </Button>
      </form>
    </div>
  );
}
