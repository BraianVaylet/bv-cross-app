import type { ExerciseDto } from '@bv/contracts';
import { BarbellIcon, ChevronRightIcon, EmptyState, ErrorBanner, PlusIcon, Skeleton } from '@bv/ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/ButtonLink';

/**
 * Home mínima post-migración: catálogo del gym + personales en una lista.
 * F2-05 la lleva a las dos secciones con RM vigente y búsqueda (spec).
 */
export function Home() {
  const { user, memberships, activeOrgId } = useAuth();
  const orgName = memberships.find((m) => m.orgId === activeOrgId)?.orgName;
  const [items, setItems] = useState<ExerciseDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.exercises
      .list()
      .then((r) => { setItems(r.items); })
      .catch((err: unknown) => { setError(errorMessage(err)); });
  }, [activeOrgId]);

  const personal = items?.filter((e) => e.scope === 'personal') ?? [];
  const catalog = items?.filter((e) => e.scope === 'org') ?? [];

  const renderItem = (e: ExerciseDto) => (
    <li key={e.id}>
      <Link
        to={`/exercises/${e.id}`}
        className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/40 active:bg-raised"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-medium text-ink">{e.name}</h3>
          <p className="mt-0.5 text-xs text-ink-dim">
            {e.type === 'reps' ? 'Repeticiones' : 'Cargas'}
            {e.discipline ? ` · ${e.discipline}` : ''}
          </p>
        </div>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-dim" />
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">Hola, {user?.name}</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Tus ejercicios</h1>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!error && items === null && (
        <div className="space-y-2.5">
          <Skeleton className="h-[76px]" />
          <Skeleton className="h-[76px]" />
          <Skeleton className="h-[76px]" />
        </div>
      )}

      {items !== null && (
        <>
          {catalog.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="font-display text-lg font-semibold text-ink">
                Ejercicios de {orgName ?? 'tu gimnasio'}
              </h2>
              <ul className="space-y-2.5">{catalog.map(renderItem)}</ul>
            </section>
          )}

          <section className="space-y-2.5">
            <h2 className="font-display text-lg font-semibold text-ink">Mis ejercicios</h2>
            {personal.length === 0 ? (
              <EmptyState
                icon={<BarbellIcon className="h-10 w-10" />}
                title="Todavía no cargaste ejercicios propios"
                text="Registrá tu primer RM para empezar a calcular cargas."
                action={
                  <ButtonLink to="/exercises/new">
                    <PlusIcon className="h-4 w-4" /> Nuevo ejercicio
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-2.5">{personal.map(renderItem)}</ul>
            )}
          </section>
        </>
      )}

      {items !== null && personal.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-base via-base/80 to-transparent" />
          <div className="relative mx-auto w-full max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <ButtonLink to="/exercises/new" size="lg" full className="shadow-lg shadow-accent/25">
              <PlusIcon className="h-5 w-5" /> Nuevo ejercicio
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
