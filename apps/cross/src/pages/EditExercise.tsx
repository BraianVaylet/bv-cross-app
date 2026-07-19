import type { EntryDto, ExerciseDto } from '@bv/contracts';
import {
  Button,
  Card,
  CheckIcon,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  PlusIcon,
  Skeleton,
  Textarea,
  TrashIcon,
  cx,
} from '@bv/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage, fieldErrors } from '../api/endpoints';
import { BackLink } from '../components/BackLink';
import { ButtonLink } from '../components/ButtonLink';
import {
  EntryFields,
  buildEntryPayload,
  emptyEntryForm,
  type EntryFormValues,
} from '../components/EntryFields';
import { fmtDate, fmtKg, todayISO } from '../lib/format';

const iconBtn =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40';

function entryValueLabel(entry: EntryDto, isReps: boolean): string {
  if (isReps) return entry.reps != null ? `${entry.reps} reps` : 'Sin marca';
  return entry.kg != null ? `${fmtKg(entry.kg)} kg` : 'Sin marca';
}

/**
 * Edición de ejercicio PERSONAL (nombre, notas, historial). Los de catálogo
 * los gestiona el gimnasio desde el CRM; acá solo se leen.
 * v2 no edita registros in-place (sin PATCH /entries): se borra y recarga.
 */
export function EditExercise() {
  const params = useParams();
  const id = params.id ?? '';
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<ExerciseDto | null>(null);
  const [entries, setEntries] = useState<EntryDto[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const initialized = useRef(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const notesFlashTimer = useRef<number | undefined>(undefined);

  const [addOpen, setAddOpen] = useState(false);
  const [addValues, setAddValues] = useState<EntryFormValues>(emptyEntryForm(todayISO()));
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [savingAdd, setSavingAdd] = useState(false);

  const [entryToDelete, setEntryToDelete] = useState<EntryDto | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [confirmDeleteEx, setConfirmDeleteEx] = useState(false);
  const [deletingEx, setDeletingEx] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ exercise: ex }, page] = await Promise.all([
        api.exercises.get(id),
        api.entries.list(id),
      ]);
      setExercise(ex);
      setEntries(page.items);
      if (!initialized.current) {
        setName(ex.name);
        setNotes(ex.notes ?? '');
        initialized.current = true;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    if (/^[0-9a-f]{24}$/i.test(id)) void load();
    else setNotFound(true);
    return () => {
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(notesFlashTimer.current);
    };
  }, [id, load]);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setSavingName(true);
    try {
      await api.exercises.update(id, { name: name.trim() });
      setNameSaved(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => { setNameSaved(false); }, 2000);
      void load();
    } catch (err) {
      const fields = fieldErrors(err);
      setNameError(fields.name ?? errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const saveNotes = async (e: FormEvent) => {
    e.preventDefault();
    setSavingNotes(true);
    try {
      await api.exercises.update(id, { notes: notes.trim() || null });
      setNotesSaved(true);
      window.clearTimeout(notesFlashTimer.current);
      notesFlashTimer.current = window.setTimeout(() => { setNotesSaved(false); }, 2000);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingNotes(false);
    }
  };

  const saveAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!exercise) return;
    const built = buildEntryPayload(exercise.type, addValues);
    if ('error' in built) {
      setAddErrors(built.error);
      return;
    }
    setAddErrors({});
    setSavingAdd(true);
    try {
      await api.entries.create({ exerciseId: id, ...built.payload });
      await load();
      setAddOpen(false);
      setAddValues(emptyEntryForm(todayISO()));
    } catch (err) {
      const fields = fieldErrors(err);
      setAddErrors(Object.keys(fields).length > 0 ? fields : { kg: errorMessage(err) });
    } finally {
      setSavingAdd(false);
    }
  };

  const deleteEntry = async () => {
    if (!entryToDelete) return;
    setDeletingEntry(true);
    try {
      await api.entries.remove(entryToDelete.id);
      await load();
      setEntryToDelete(null);
    } catch (err) {
      setEntryToDelete(null);
      setError(errorMessage(err)); // LAST_ENTRY llega con su mensaje del server
    } finally {
      setDeletingEntry(false);
    }
  };

  const deleteExercise = async () => {
    setDeletingEx(true);
    try {
      await api.exercises.remove(id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDeleteEx(false);
      setDeletingEx(false);
    }
  };

  if (notFound) {
    return (
      <div className="space-y-5">
        <BackLink to="/">Ejercicios</BackLink>
        <EmptyState
          title="No encontramos ese ejercicio"
          text="Puede que lo hayas eliminado."
          action={
            <ButtonLink to="/" variant="secondary">
              Ir a mis ejercicios
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="space-y-5">
        <BackLink to={`/exercises/${id}`}>Volver</BackLink>
        {error ? (
          <ErrorBanner>{error}</ErrorBanner>
        ) : (
          <>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </>
        )}
      </div>
    );
  }

  if (exercise.scope === 'org') {
    return (
      <div className="space-y-5">
        <BackLink to={`/exercises/${id}`}>Volver al ejercicio</BackLink>
        <EmptyState
          title="Este ejercicio es del gimnasio"
          text="Su catálogo lo gestionan los coaches. Podés registrar tus marcas desde el detalle."
          action={
            <ButtonLink to={`/exercises/${id}`} variant="secondary">
              Ir al detalle
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const single = entries.length === 1;
  const isReps = exercise.type === 'reps';
  const historyTitle = isReps ? 'Historial de marcas' : 'Historial de RMs';

  return (
    <div className="space-y-5">
      <BackLink to={`/exercises/${id}`}>Volver al ejercicio</BackLink>
      <h1 className="font-display text-2xl font-semibold text-ink">Editar ejercicio</h1>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Card>
        <form onSubmit={(e) => void saveName(e)} className="space-y-3">
          <Input
            label="Nombre"
            required
            maxLength={80}
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            error={nameError}
          />
          <Button type="submit" variant="secondary" loading={savingName}>
            {nameSaved ? (
              <>
                <CheckIcon className="h-4 w-4 text-ok" /> Guardado
              </>
            ) : (
              'Guardar nombre'
            )}
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={(e) => void saveNotes(e)} className="space-y-3">
          <Textarea
            label="Notas"
            placeholder="Ej: Mantener escápulas activas, cuidar la rodilla derecha…"
            maxLength={500}
            rows={3}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); }}
          />
          <Button type="submit" variant="secondary" loading={savingNotes}>
            {notesSaved ? (
              <>
                <CheckIcon className="h-4 w-4 text-ok" /> Guardado
              </>
            ) : (
              'Guardar notas'
            )}
          </Button>
        </form>
      </Card>

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{historyTitle}</h2>
          {single && <span className="text-xs text-ink-dim">El único registro no se puede borrar</span>}
        </div>

        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {entryValueLabel(entry, isReps)}
                <span className="ml-2 text-xs font-normal text-ink-dim">{fmtDate(entry.date)}</span>
              </p>
              {entry.comment && <p className="mt-0.5 truncate text-xs text-ink-muted">{entry.comment}</p>}
            </div>
            <button
              type="button"
              aria-label={`Borrar registro del ${fmtDate(entry.date)}`}
              className={cx(iconBtn, 'hover:text-danger')}
              disabled={single}
              onClick={() => { setEntryToDelete(entry); }}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {addOpen ? (
          <Card className="space-y-4">
            <h3 className="font-display text-base font-semibold text-ink">
              {isReps ? 'Agregar marca' : 'Agregar RM'}
            </h3>
            <form onSubmit={(e) => void saveAdd(e)} className="space-y-4">
              <EntryFields values={addValues} onChange={setAddValues} errors={addErrors} type={exercise.type} />
              <div className="flex gap-2.5">
                <Button variant="secondary" full onClick={() => { setAddOpen(false); }} disabled={savingAdd}>
                  Cancelar
                </Button>
                <Button type="submit" full loading={savingAdd}>
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Button
            variant="secondary"
            full
            onClick={() => {
              setAddValues(emptyEntryForm(todayISO()));
              setAddErrors({});
              setAddOpen(true);
            }}
          >
            <PlusIcon className="h-4 w-4" /> {isReps ? 'Agregar marca' : 'Agregar RM'}
          </Button>
        )}
      </section>

      <Card className="space-y-3 border-danger/30">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Eliminar ejercicio</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            Se borra «{exercise.name}» con todo su historial. No se puede deshacer.
          </p>
        </div>
        <Button variant="danger" full onClick={() => { setConfirmDeleteEx(true); }}>
          Eliminar ejercicio
        </Button>
      </Card>

      <ConfirmDialog
        open={entryToDelete !== null}
        title="¿Borrar este registro?"
        message={
          entryToDelete
            ? `Se borra el registro de ${entryValueLabel(entryToDelete, isReps)} del ${fmtDate(entryToDelete.date)}.`
            : ''
        }
        confirmLabel="Borrar"
        loading={deletingEntry}
        onConfirm={() => void deleteEntry()}
        onCancel={() => { setEntryToDelete(null); }}
      />

      <ConfirmDialog
        open={confirmDeleteEx}
        title={`¿Eliminar «${exercise.name}»?`}
        message="Se borra el ejercicio con todo su historial. No se puede deshacer."
        confirmLabel="Eliminar"
        loading={deletingEx}
        onConfirm={() => void deleteExercise()}
        onCancel={() => { setConfirmDeleteEx(false); }}
      />
    </div>
  );
}
