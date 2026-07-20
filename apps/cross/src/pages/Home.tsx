import type { ExerciseDto } from '@bv/contracts';
import {
  BarbellIcon,
  ChevronRightIcon,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  PencilIcon,
  PlusIcon,
  Skeleton,
  TrashIcon,
  cx,
} from '@bv/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/ButtonLink';
import { exerciseImage } from '../lib/exerciseImages';
import { groupExercises } from '../lib/groupExercises';

const iconBtn =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-raised hover:text-ink';

function ExerciseRow({ exercise, actions }: { exercise: ExerciseDto; actions?: ReactNode }) {
  const image = exerciseImage(exercise.name, exercise.imageUrl);
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-accent/40">
      <Link to={`/exercises/${exercise.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised text-ink-dim">
          {image ? (
            <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <BarbellIcon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-medium text-ink">{exercise.name}</span>
          <span className="block text-xs text-ink-dim">
            {exercise.type === 'reps' ? 'Repeticiones' : 'Cargas'}
            {exercise.discipline ? ` · ${exercise.discipline}` : ''}
          </span>
        </span>
      </Link>
      {actions ?? <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-dim" />}
    </li>
  );
}

/**
 * Home (F2-05): catálogo del gimnasio + ejercicios personales, con búsqueda
 * local única sobre ambas secciones. El catálogo es solo lectura para el
 * atleta; los personales tienen editar/borrar. Los archivados por el gym
 * quedan en una subsección colapsada de solo lectura (RN-19).
 */
export function Home() {
  const { user, memberships, activeOrgId } = useAuth();
  const orgName = memberships.find((m) => m.orgId === activeOrgId)?.orgName;

  const [items, setItems] = useState<ExerciseDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [toDelete, setToDelete] = useState<ExerciseDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    api.exercises
      .list()
      .then((r) => {
        setItems(r.items);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
      });
  };

  useEffect(() => {
    setItems(null);
    load();
  }, [activeOrgId]);

  const groups = useMemo(() => groupExercises(items ?? [], query), [items, query]);

  const onDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.exercises.remove(toDelete.id);
      setToDelete(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const personalActions = (e: ExerciseDto) => (
    <span className="flex shrink-0 items-center gap-0.5">
      <Link to={`/exercises/${e.id}/edit`} aria-label={`Editar ${e.name}`} className={iconBtn}>
        <PencilIcon className="h-4 w-4" />
      </Link>
      <button
        type="button"
        aria-label={`Borrar ${e.name}`}
        className={cx(iconBtn, 'hover:text-danger')}
        onClick={() => { setToDelete(e); }}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </span>
  );

  const hasAny = items !== null && items.length > 0;
  const nothingMatches =
    items !== null &&
    query.trim() !== '' &&
    groups.catalog.length + groups.personal.length + groups.archived.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">Hola, {user?.name}</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Tus ejercicios</h1>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {hasAny && (
        <Input
          type="search"
          placeholder="Buscar ejercicio…"
          aria-label="Buscar ejercicio"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      )}

      {!error && items === null && (
        <div className="space-y-2.5">
          <Skeleton className="h-[68px]" />
          <Skeleton className="h-[68px]" />
          <Skeleton className="h-[68px]" />
        </div>
      )}

      {nothingMatches && (
        <EmptyState title="Sin resultados" text={`Ningún ejercicio coincide con "${query.trim()}".`} />
      )}

      {items !== null && !nothingMatches && (
        <>
          {groups.catalog.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="font-display text-lg font-semibold text-ink">
                Ejercicios de {orgName ?? 'tu gimnasio'}
              </h2>
              <ul className="space-y-2.5">
                {groups.catalog.map((e) => (
                  <ExerciseRow key={e.id} exercise={e} />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2.5">
            <h2 className="font-display text-lg font-semibold text-ink">Mis ejercicios</h2>
            {groups.personal.length === 0 ? (
              <EmptyState
                icon={<BarbellIcon className="h-10 w-10" />}
                title={query.trim() ? 'Sin personales que coincidan' : 'Todavía no cargaste ejercicios propios'}
                text="Registrá tu primer RM para empezar a calcular cargas."
                action={
                  <ButtonLink to="/exercises/new">
                    <PlusIcon className="h-4 w-4" /> Nuevo ejercicio
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {groups.personal.map((e) => (
                  <ExerciseRow key={e.id} exercise={e} actions={personalActions(e)} />
                ))}
              </ul>
            )}
          </section>

          {groups.archived.length > 0 && (
            <section className="space-y-2.5">
              <button
                type="button"
                onClick={() => { setShowArchived((v) => !v); }}
                aria-expanded={showArchived}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <span>Archivados por el gimnasio ({groups.archived.length})</span>
                <ChevronRightIcon
                  className={cx('h-4 w-4 transition-transform', showArchived && 'rotate-90')}
                />
              </button>
              {showArchived && (
                <ul className="space-y-2.5 opacity-75">
                  {groups.archived.map((e) => (
                    <ExerciseRow key={e.id} exercise={e} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {items !== null && groups.personal.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-base via-base/80 to-transparent" />
          <div className="relative mx-auto w-full max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <ButtonLink to="/exercises/new" size="lg" full className="shadow-lg shadow-accent/25">
              <PlusIcon className="h-5 w-5" /> Nuevo ejercicio
            </ButtonLink>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? `¿Eliminar «${toDelete.name}»?` : ''}
        message="Se borra el ejercicio con todo su historial. No se puede deshacer."
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => { setToDelete(null); }}
      />
    </div>
  );
}
