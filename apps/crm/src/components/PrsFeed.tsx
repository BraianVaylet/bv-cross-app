import type { PrEntryDto } from '@bv/contracts';
import { Card, EmptyState, ErrorBanner, Skeleton } from '@bv/ui';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/endpoints';

/** "hoy" · "ayer" · "hace 5 días" · "12/06" para lo viejo. */
function relativeDay(ymd: string, today = new Date()): string {
  const dias = Math.round(
    (Date.parse(`${today.toISOString().slice(0, 10)}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) /
      86_400_000,
  );
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 8) return `hace ${String(dias)} días`;
  return ymd.slice(5).split('-').reverse().join('/');
}

/**
 * Últimos récords del gimnasio (F3-09). Es la pantalla que el dueño mira para
 * felicitar a alguien, así que dice quién, qué y cuánto mejoró.
 */
export function PrsFeed({ limit = 10 }: { limit?: number }) {
  const [items, setItems] = useState<PrEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const { items: prs } = await api.stats.prsFeed(limit);
        setItems(prs);
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [limit]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (items === null) return <Skeleton className="h-32 rounded-2xl" />;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay récords"
        text="Cuando tus clientes empiecen a registrar cargas, sus mejores marcas aparecen acá."
      />
    );
  }

  return (
    <Card className="space-y-2">
      <h2 className="font-display text-base font-semibold text-ink">Últimos récords</h2>
      <ul className="space-y-1.5">
        {items.map((pr) => (
          <li key={pr.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span aria-hidden="true">🏋️ </span>
              <span className="font-medium text-ink">{pr.userName}</span>
              <span className="text-ink-muted"> — {pr.exerciseName} </span>
              <span className="font-medium text-ink">
                {pr.value} {pr.type === 'reps' ? 'reps' : 'kg'}
              </span>
              {pr.improvement !== null && (
                <span className="text-ok"> (+{pr.improvement})</span>
              )}
            </span>
            <span className="shrink-0 text-xs text-ink-dim">{relativeDay(pr.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
