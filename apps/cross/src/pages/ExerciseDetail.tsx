import type { EntryDto, ExerciseDto } from '@bv/contracts';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  ImageIcon,
  Input,
  MessageSquareIcon,
  Modal,
  PencilIcon,
  PlusIcon,
  Segmented,
  Skeleton,
  TrashIcon,
  ZapIcon,
  cx,
} from '@bv/ui';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { currentRm } from '../lib/currentRm';
import { exerciseImage } from '../lib/exerciseImages';
import { fmtDate, fmtKg, percentWeight, roundTo, todayISO } from '../lib/format';
import { useLocalStorage } from '../lib/useLocalStorage';

const PRESET_PCTS = [65, 75, 80, 85, 90, 95];

type RoundValue = 'exact' | '1.25' | '2.5' | '5';
const ROUND_OPTIONS: Array<{ value: RoundValue; label: string }> = [
  { value: 'exact', label: 'Exacto' },
  { value: '1.25', label: '1,25' },
  { value: '2.5', label: '2,5' },
  { value: '5', label: '5' },
];

const iconBtn =
  'flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink';

// Escala de esfuerzo: verde (liviano) → amarillo → rojo (pesado), según el % del RM.
const EFFORT_LOW = 50;
const EFFORT_HIGH = 100;
const RING_R = 115;
const RING_CIRC = 2 * Math.PI * RING_R;

function effortRatio(pct: number): number {
  return Math.max(0, Math.min(1, (pct - EFFORT_LOW) / (EFFORT_HIGH - EFFORT_LOW)));
}

/** Color del esfuerzo interpolado en HSL. `alpha < 1` para fondos suaves. */
function effortColor(pct: number, alpha = 1): string {
  const e = effortRatio(pct);
  const hue = Math.round(115 - 115 * e);
  const sat = Math.round(62 + 16 * e);
  const light = Math.round(46 - 4 * e);
  return `hsl(${hue} ${sat}% ${light}%${alpha < 1 ? ` / ${alpha}` : ''})`;
}

function effortLabel(pct: number): string {
  if (pct < 70) return 'Liviana';
  if (pct < 90) return 'Media';
  return 'Pesada';
}

export function ExerciseDetail() {
  const params = useParams();
  const id = params.id ?? '';
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<ExerciseDto | null>(null);
  const [entries, setEntries] = useState<EntryDto[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseId, setBaseId] = useState<string | null>(null);
  const [pct, setPct] = useState(80);
  const [custom, setCustom] = useState('');
  const [round, setRound] = useLocalStorage<RoundValue>('bv-round', '2.5');

  const [showNew, setShowNew] = useState(false);
  const [newEntry, setNewEntry] = useState<EntryFormValues>(emptyEntryForm(todayISO()));
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [savingEntry, setSavingEntry] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ exercise: ex }, page] = await Promise.all([
        api.exercises.get(id),
        api.entries.list(id),
      ]);
      setExercise(ex);
      setEntries(page.items);
      setBaseId((prev) =>
        prev !== null && page.items.some((e) => e.id === prev) ? prev : (currentRm(page.items)?.id ?? null),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    if (/^[0-9a-f]{24}$/i.test(id)) void load();
    else setNotFound(true);
  }, [id, load]);

  const list = useMemo(() => entries ?? [], [entries]);
  const currentEntry = useMemo(() => currentRm(list), [list]);
  const base = useMemo(() => list.find((e) => e.id === baseId) ?? currentEntry, [list, baseId, currentEntry]);
  const isCurrent = base !== null && currentEntry?.id === base.id;
  const isReps = exercise?.type === 'reps';
  const isPersonal = exercise?.scope === 'personal';

  const customNum = custom === '' ? null : Number(custom.replace(',', '.'));
  const customValid =
    customNum === null || (Number.isFinite(customNum) && customNum > 0 && customNum <= 200);
  const activePct = customNum !== null && customValid ? customNum : pct;
  const step = round === 'exact' ? null : Number(round);
  const rmKg = base?.kg ?? 0;
  const exact = percentWeight(rmKg, activePct);
  const result = roundTo(exact, step);
  const showExact = step !== null && Math.abs(result - exact) > 0.004;

  const loadColor = effortColor(activePct);
  const ringFill = Math.max(0, Math.min(1, activePct / 100));

  const submitNewEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!exercise) return;
    const built = buildEntryPayload(exercise.type, newEntry);
    if ('error' in built) {
      setEntryErrors(built.error);
      return;
    }
    setEntryErrors({});
    setSavingEntry(true);
    try {
      const { entry } = await api.entries.create({ exerciseId: id, ...built.payload });
      await load();
      setBaseId(entry.id);
      setShowNew(false);
      setNewEntry(emptyEntryForm(todayISO()));
    } catch (err) {
      const fields = fieldErrors(err);
      setEntryErrors(Object.keys(fields).length > 0 ? fields : { kg: errorMessage(err) });
    } finally {
      setSavingEntry(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.exercises.remove(id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDelete(false);
      setDeleting(false);
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

  if (!exercise || entries === null) {
    return (
      <div className="space-y-5">
        <BackLink to="/">Ejercicios</BackLink>
        {error ? (
          <ErrorBanner>{error}</ErrorBanner>
        ) : (
          <>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24" />
            <Skeleton className="mx-auto h-60 w-60 rounded-full" />
            <Skeleton className="h-24" />
          </>
        )}
      </div>
    );
  }

  const image = exerciseImage(exercise.name, exercise.imageUrl);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackLink to="/">Ejercicios</BackLink>
        <div className="flex items-center gap-1">
          {image && (
            <button
              type="button"
              onClick={() => { setShowImage(true); }}
              aria-label="Ver técnica del ejercicio"
              className={iconBtn}
            >
              <ImageIcon className="h-5 w-5" />
            </button>
          )}
          {isPersonal && (
            <>
              <Link to={`/exercises/${id}/edit`} aria-label="Editar ejercicio" className={iconBtn}>
                <PencilIcon className="h-5 w-5" />
              </Link>
              <button
                type="button"
                onClick={() => { setConfirmDelete(true); }}
                aria-label="Eliminar ejercicio"
                className={cx(iconBtn, 'hover:text-danger')}
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">
          {exercise.name}
        </h1>
        {isReps && (
          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
            Repeticiones
          </span>
        )}
        {!isPersonal && (
          <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            Del gimnasio
          </span>
        )}
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {exercise.notes && (
        <div className="flex items-start gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
          <MessageSquareIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim" />
          <span>{exercise.notes}</span>
        </div>
      )}

      {base === null ? (
        <EmptyState
          title={isReps ? 'Sin marcas todavía' : 'Sin RM todavía'}
          text="Registrá tu primera marca para empezar."
        />
      ) : (
        <Card>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-muted">
              {isReps ? 'Máximo de reps' : 'RM base'}
            </span>
            <span
              className={cx(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                isCurrent ? 'bg-accent-soft text-accent' : 'bg-raised text-ink-muted',
              )}
            >
              {isCurrent ? 'Vigente' : 'Histórico'}
            </span>
            {base.painFlag && (
              <ZapIcon className="h-4 w-4 shrink-0 text-danger" aria-label="Con dolor" />
            )}
          </div>
          <p className="mt-1">
            <span className="font-display text-3xl font-semibold text-ink">
              {isReps ? (base.reps ?? '—') : fmtKg(base.kg ?? 0)}
            </span>
            <span className="ml-1.5 text-ink-muted">{isReps ? 'reps' : 'kg'}</span>
            <span className="ml-3 text-sm text-ink-dim">{fmtDate(base.date)}</span>
          </p>
          {base.comment && <p className="mt-1.5 text-sm italic text-ink-muted">{base.comment}</p>}
        </Card>
      )}

      {!isReps && base !== null && (
        <>
          {/* Resultado: el disco */}
          <section aria-label="Carga calculada" className="py-1">
            <div className="relative mx-auto h-60 w-60">
              <svg viewBox="0 0 240 240" className="h-full w-full">
                <circle cx="120" cy="120" r={RING_R - 5} fill="var(--c-surface)" />
                <circle
                  aria-hidden
                  cx="120"
                  cy="120"
                  r="100"
                  fill="none"
                  stroke="var(--c-line)"
                  strokeWidth="1"
                />
                <circle cx="120" cy="120" r={RING_R} fill="none" stroke="var(--c-line)" strokeWidth="10" />
                <circle
                  cx="120"
                  cy="120"
                  r={RING_R}
                  fill="none"
                  stroke={loadColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC * (1 - ringFill)}
                  transform="rotate(-90 120 120)"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-7 text-center">
                  <p className="text-[13px] font-medium text-ink-muted">
                    {fmtKg(activePct)}% de {fmtKg(base.kg ?? 0)} kg
                  </p>
                  <p className="font-display text-5xl font-semibold tracking-tight text-ink">
                    {customValid ? fmtKg(result) : '—'}
                  </p>
                  <p className="text-sm text-ink-muted">kg</p>
                  {customValid && showExact && (
                    <p className="mt-1 text-xs text-ink-dim">exacto: {fmtKg(exact)} kg</p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-center">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                style={{ color: loadColor, backgroundColor: effortColor(activePct, 0.14) }}
              >
                Carga {effortLabel(activePct).toLowerCase()}
              </span>
            </div>
          </section>

          <div className="grid grid-cols-3 gap-2">
            {PRESET_PCTS.map((p) => {
              const active = custom === '' && pct === p;
              const weight = roundTo(percentWeight(base.kg ?? 0, p), step);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setPct(p);
                    setCustom('');
                  }}
                  className={cx(
                    'rounded-xl border px-2 py-2.5 text-center transition-colors',
                    active
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line bg-surface text-ink hover:border-accent/40',
                  )}
                >
                  <span className={cx('block text-base font-semibold', !active && 'text-ink-muted')}>
                    {p}%
                  </span>
                  <span className={cx('block text-xs', active ? 'text-on-accent/75' : 'text-ink-muted')}>
                    {fmtKg(weight)} kg
                  </span>
                </button>
              );
            })}
          </div>

          <Card className="space-y-4">
            <Input
              label="Porcentaje personalizado"
              type="number"
              inputMode="decimal"
              min="1"
              max="200"
              step="0.5"
              suffix="%"
              placeholder="Ej: 72,5"
              value={custom}
              onChange={(e) => { setCustom(e.target.value); }}
              error={customValid ? undefined : 'Ingresá un porcentaje entre 1 y 200'}
            />
            <Segmented label="Redondeo (kg)" options={ROUND_OPTIONS} value={round} onChange={setRound} />
          </Card>
        </>
      )}

      {list.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Historial</h2>
            <span className="text-xs text-ink-dim">Tocá uno para usarlo de base</span>
          </div>
          {list.map((e) => {
            const selected = base?.id === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={selected}
                onClick={() => { setBaseId(e.id); }}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors',
                  selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {fmtDate(e.date)}
                    {e.id === currentEntry?.id && (
                      <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        Vigente
                      </span>
                    )}
                    {e.painFlag && (
                      <ZapIcon className="ml-1.5 inline h-3.5 w-3.5 text-danger" aria-label="Con dolor" />
                    )}
                  </p>
                  {e.comment && <p className="mt-0.5 truncate text-xs text-ink-muted">{e.comment}</p>}
                </div>
                <p className="shrink-0 font-display text-lg font-semibold text-ink">
                  {isReps ? (
                    <>
                      {e.reps ?? '—'} <span className="text-xs font-normal text-ink-muted">reps</span>
                    </>
                  ) : (
                    <>
                      {fmtKg(e.kg ?? 0)} <span className="text-xs font-normal text-ink-muted">kg</span>
                    </>
                  )}
                </p>
              </button>
            );
          })}
        </section>
      )}

      {exercise.archivedAt ? (
        <p className="rounded-xl border border-line bg-raised px-3 py-2 text-sm text-ink-muted">
          El gimnasio archivó este ejercicio: el historial queda, pero no admite marcas nuevas.
        </p>
      ) : showNew ? (
        <Card className="space-y-4">
          <h3 className="font-display text-base font-semibold text-ink">
            {isReps ? 'Registrar nueva marca' : 'Registrar nuevo RM'}
          </h3>
          <form onSubmit={(e) => void submitNewEntry(e)} className="space-y-4">
            <EntryFields values={newEntry} onChange={setNewEntry} errors={entryErrors} type={exercise.type} />
            <div className="flex gap-2.5">
              <Button variant="secondary" full onClick={() => { setShowNew(false); }} disabled={savingEntry}>
                Cancelar
              </Button>
              <Button type="submit" full loading={savingEntry}>
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
            setNewEntry(emptyEntryForm(todayISO()));
            setEntryErrors({});
            setShowNew(true);
          }}
        >
          <PlusIcon className="h-4 w-4" /> {isReps ? 'Registrar nueva marca' : 'Registrar nuevo RM'}
        </Button>
      )}

      <Modal open={showImage} onClose={() => { setShowImage(false); }} title={`Técnica · ${exercise.name}`}>
        <img
          src={image ?? ''}
          alt={`Demostración de ${exercise.name}`}
          loading="lazy"
          decoding="async"
          className="mx-auto w-full rounded-xl"
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`¿Eliminar «${exercise.name}»?`}
        message="Se borra el ejercicio con todo su historial. No se puede deshacer."
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => { setConfirmDelete(false); }}
      />
    </div>
  );
}
