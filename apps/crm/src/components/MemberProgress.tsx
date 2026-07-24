import type { ExerciseDto, ProgressDto } from '@bv/contracts';
import { Badge, Card, EmptyState, ErrorBanner, Select, SimpleChart, Skeleton } from '@bv/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/endpoints';

const fmtDate = (ymd: string): string => ymd.slice(5).split('-').reverse().join('/');

/**
 * Evolución del cliente en un ejercicio del catálogo (F3-09).
 *
 * Solo aparecen los ejercicios sobre los que ya cargó algo: un selector con
 * 40 opciones vacías no ayuda a nadie. Los personales del atleta no están —
 * el CRM no los ve (RN-20) y eso lo garantiza la API.
 */
export function MemberProgress({ memberId }: { memberId: string }) {
  const [exercises, setExercises] = useState<ExerciseDto[] | null>(null);
  const [selected, setSelected] = useState('');
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const { items } = await api.stats.memberExercises(memberId);
        setExercises(items);
        const first = items[0];
        if (first) setSelected(first.id);
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [memberId]);

  const load = useCallback(async (): Promise<void> => {
    if (selected === '') return;
    setLoadingProgress(true);
    setError(null);
    try {
      const { progress: p } = await api.stats.memberProgress(memberId, selected);
      setProgress(p);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingProgress(false);
    }
  }, [memberId, selected]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && exercises === null) return <ErrorBanner>{error}</ErrorBanner>;

  if (exercises === null) return <Skeleton className="h-48 rounded-2xl" />;

  if (exercises.length === 0) {
    return (
      <EmptyState
        title="Todavía no cargó nada"
        text="Cuando registre sus primeras cargas desde la app, su evolución aparece acá."
      />
    );
  }

  const unit = progress?.type === 'reps' ? 'reps' : 'kg';

  return (
    <div className="space-y-3">
      <Select
        label="Ejercicio"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
        }}
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </Select>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loadingProgress || !progress ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-sm text-ink-muted">
                Vigente:{' '}
                <span className="font-display text-lg font-semibold text-ink">
                  {progress.currentRm ?? '—'} {unit}
                </span>
              </p>
              {progress.best !== null && progress.best !== progress.currentRm && (
                <p className="text-sm text-ink-muted">
                  Mejor marca: <span className="font-medium text-ink">{progress.best} {unit}</span>
                </p>
              )}
            </div>

            <SimpleChart
              unit={unit}
              label={`Evolución de ${progress.exerciseName}`}
              points={progress.points.map((p) => ({
                value: p.value,
                label: fmtDate(p.date),
                highlight: p.isPr,
                ...(p.painFlag !== undefined ? { warn: p.painFlag } : {}),
                ...(p.comment !== undefined ? { note: p.comment } : {}),
              }))}
            />
            <p className="text-xs text-ink-dim">
              Los puntos llenos son récords. El vigente es el más reciente, no el más alto.
            </p>
          </Card>

          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">Historial de cargas</caption>
              <thead className="border-b border-line bg-raised/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">Fecha</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">{unit}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">Notas</th>
                </tr>
              </thead>
              <tbody>
                {[...progress.points].reverse().map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink">{p.value}</span>
                      {p.isPr && (
                        <span className="ml-2">
                          <Badge tone="accent">PR</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {p.painFlag && <span title="Registró dolor">⚠ </span>}
                      {p.comment ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
