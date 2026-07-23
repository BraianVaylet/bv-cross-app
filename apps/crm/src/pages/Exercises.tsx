import type { ExerciseDto } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Textarea,
  useToast,
} from '@bv/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { BASIC_EXERCISES } from '../lib/basicExercises';
import { usePageTitle } from '../lib/usePageTitle';

type Tab = 'active' | 'archived';

const TYPE_LABEL: Record<string, string> = { weight: 'Kilos', reps: 'Repeticiones' };

/** Catálogo de ejercicios del gimnasio (F3-08). */
export function Exercises() {
  usePageTitle('Ejercicios');
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('active');
  const [items, setItems] = useState<ExerciseDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExerciseDto | 'new' | null>(null);
  const [toArchive, setToArchive] = useState<ExerciseDto | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [loadingBasics, setLoadingBasics] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    setItems(null);
    try {
      const { items: list } = await api.exercises.list(true);
      setItems(list);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activos = (items ?? []).filter((e) => e.archivedAt === undefined);
  const archivados = (items ?? []).filter((e) => e.archivedAt !== undefined);
  const visibles = tab === 'active' ? activos : archivados;

  const upsert = (exercise: ExerciseDto): void => {
    setItems((prev) => {
      const list = prev ?? [];
      return list.some((e) => e.id === exercise.id)
        ? list.map((e) => (e.id === exercise.id ? exercise : e))
        : [...list, exercise];
    });
  };

  /**
   * Carga rápida del set básico. Un nombre repetido no aborta el lote: se
   * cuenta como omitido y sigue con el resto — el dueño que ya cargó tres a
   * mano no tiene que adivinar cuáles.
   */
  const loadBasics = async (): Promise<void> => {
    setLoadingBasics(true);
    let creados = 0;
    let omitidos = 0;
    for (const basic of BASIC_EXERCISES) {
      try {
        const { exercise } = await api.exercises.create({ ...basic, scope: 'org' });
        upsert(exercise);
        creados += 1;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') omitidos += 1;
        else {
          toast.show(errorMessage(err), 'danger');
          break;
        }
      }
    }
    setLoadingBasics(false);
    toast.show(
      omitidos > 0
        ? `${String(creados)} ejercicios cargados; ${String(omitidos)} ya existían.`
        : `${String(creados)} ejercicios cargados.`,
    );
  };

  const confirmArchive = async (): Promise<void> => {
    if (!toArchive) return;
    setArchiving(true);
    try {
      const { exercise } = await api.exercises.archive(toArchive.id, true);
      upsert(exercise);
      setToArchive(null);
      toast.show('Ejercicio archivado.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setArchiving(false);
    }
  };

  const restore = async (exercise: ExerciseDto): Promise<void> => {
    try {
      const { exercise: restored } = await api.exercises.archive(exercise.id, false);
      upsert(restored);
      toast.show('Ejercicio restaurado.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    }
  };

  const disciplinas = [...new Set(activos.map((e) => e.discipline).filter((d) => d !== undefined))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Ejercicios</h1>
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          Nuevo ejercicio
        </Button>
      </div>

      <Segmented<Tab>
        options={[
          { value: 'active', label: `En el catálogo (${String(activos.length)})` },
          { value: 'archived', label: `Archivados (${String(archivados.length)})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : items === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? 'Todavía no hay ejercicios' : 'No hay ejercicios archivados'}
          text={
            tab === 'active'
              ? 'Cargá el catálogo de tu gimnasio: es lo que van a ver los atletas al registrar sus cargas.'
              : 'Cuando archives uno va a quedar acá. Los atletas conservan su historial (RN-19).'
          }
          {...(tab === 'active'
            ? {
                action: (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      onClick={() => {
                        setEditing('new');
                      }}
                    >
                      Cargá tu primer ejercicio
                    </Button>
                    <Button
                      variant="secondary"
                      loading={loadingBasics}
                      onClick={() => void loadBasics()}
                    >
                      Cargar los {BASIC_EXERCISES.length} básicos
                    </Button>
                  </div>
                ),
              }
            : {})}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visibles.map((exercise) => (
            <li key={exercise.id}>
              <Card className="flex h-full items-start gap-3">
                {exercise.imageUrl ? (
                  <img
                    src={exercise.imageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    onError={(e) => {
                      // Una URL rota no deja un ícono de imagen partida.
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-ink">{exercise.name}</p>
                    <Badge>{TYPE_LABEL[exercise.type] ?? exercise.type}</Badge>
                    {exercise.archivedAt && <Badge tone="warn">Archivado</Badge>}
                  </div>
                  {exercise.discipline && (
                    <p className="text-sm text-ink-muted">{exercise.discipline}</p>
                  )}
                  {exercise.notes && <p className="text-sm text-ink-dim">{exercise.notes}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {exercise.archivedAt ? (
                      <Button variant="secondary" size="sm" onClick={() => void restore(exercise)}>
                        Restaurar
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditing(exercise);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setToArchive(exercise);
                          }}
                        >
                          Archivar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ExerciseForm
        exercise={editing}
        disciplinas={disciplinas}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={(exercise) => {
          upsert(exercise);
          setEditing(null);
          toast.show('Ejercicio guardado.');
        }}
      />

      <ConfirmDialog
        open={toArchive !== null}
        title="Archivar el ejercicio"
        message="Sale del catálogo y nadie va a poder cargar registros nuevos. Los atletas conservan su historial y lo siguen viendo en el detalle."
        confirmLabel="Archivar"
        danger={false}
        loading={archiving}
        onCancel={() => {
          setToArchive(null);
        }}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  );
}

/**
 * Alta y edición. El tipo (kg/reps) se bloquea cuando ya hay registros
 * cargados: cambiarlo invalidaría el historial (TYPE_LOCKED, RN-23). Como con
 * RN-14 en packs, la regla se comunica antes del error.
 */
function ExerciseForm({
  exercise,
  disciplinas,
  onClose,
  onSaved,
}: {
  exercise: ExerciseDto | 'new' | null;
  disciplinas: string[];
  onClose: () => void;
  onSaved: (exercise: ExerciseDto) => void;
}) {
  const editing = exercise !== null && exercise !== 'new' ? exercise : null;
  const typeLocked = editing?.hasEntries === true;

  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [type, setType] = useState<'weight' | 'reps'>('weight');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [imageBroken, setImageBroken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (exercise === null) return;
    setError(null);
    setImageBroken(false);
    if (exercise === 'new') {
      setName('');
      setDiscipline('');
      setType('weight');
      setImageUrl('');
      setNotes('');
    } else {
      setName(exercise.name);
      setDiscipline(exercise.discipline ?? '');
      setType(exercise.type);
      setImageUrl(exercise.imageUrl ?? '');
      setNotes(exercise.notes ?? '');
    }
  }, [exercise]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        const { exercise: saved } = await api.exercises.update(editing.id, {
          name: name.trim(),
          discipline: discipline.trim() === '' ? null : discipline.trim(),
          imageUrl: imageUrl.trim() === '' ? null : imageUrl.trim(),
          notes: notes.trim() === '' ? null : notes.trim(),
          // Con historial el tipo ni siquiera viaja: el server lo rechazaría.
          ...(typeLocked ? {} : { type }),
        });
        onSaved(saved);
      } else {
        const { exercise: created } = await api.exercises.create({
          name: name.trim(),
          type,
          scope: 'org',
          ...(discipline.trim() ? { discipline: discipline.trim() } : {}),
          ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        onSaved(created);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={exercise !== null}
      title={editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Input
          label="Nombre"
          required
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />

        <div className="space-y-1.5">
          <label htmlFor="ex-discipline" className="block text-sm font-medium text-ink-muted">
            Disciplina
          </label>
          <input
            id="ex-discipline"
            list="ex-disciplines"
            value={discipline}
            onChange={(e) => {
              setDiscipline(e.target.value);
            }}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-ink placeholder:text-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          <datalist id="ex-disciplines">
            {disciplinas.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        <fieldset className="space-y-1.5" disabled={typeLocked}>
          <legend className="text-sm font-medium text-ink-muted">Se registra en</legend>
          <div className="flex gap-4">
            {(['weight', 'reps'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => {
                    setType(value);
                  }}
                />
                {TYPE_LABEL[value]}
              </label>
            ))}
          </div>
          {typeLocked && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
              Ya hay registros cargados con este ejercicio: cambiar de kilos a repeticiones
              invalidaría el historial de los atletas.
            </p>
          )}
        </fieldset>

        <Input
          label="Imagen (URL)"
          type="url"
          value={imageUrl}
          onChange={(e) => {
            setImageUrl(e.target.value);
            setImageBroken(false);
          }}
        />
        {imageUrl.trim() !== '' &&
          (imageBroken ? (
            <p className="rounded-xl bg-raised px-3 py-2 text-sm text-ink-muted">
              No pudimos cargar esa imagen. Revisá el enlace.
            </p>
          ) : (
            <img
              src={imageUrl}
              alt="Vista previa"
              className="h-24 w-24 rounded-xl object-cover"
              onError={() => {
                setImageBroken(true);
              }}
            />
          ))}

        <Textarea
          label="Notas"
          rows={2}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />

        <Button type="submit" full loading={saving} disabled={name.trim().length === 0}>
          {editing ? 'Guardar cambios' : 'Crear ejercicio'}
        </Button>
      </form>
    </Modal>
  );
}
