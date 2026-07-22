import type { CreditPackDto, CreditsDto } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Skeleton,
  expiryLabel,
  shortDate,
} from '@bv/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

const STATUS_BADGE: Record<string, { tone: 'ok' | 'neutral' | 'warn' | 'danger'; label: string }> = {
  active: { tone: 'ok', label: 'Activo' },
  exhausted: { tone: 'neutral', label: 'Agotado' },
  expired: { tone: 'warn', label: 'Vencido' },
  cancelled: { tone: 'danger', label: 'Anulado' },
};

/** Saldo del atleta (F4-06): qué puede usar hoy y qué quedó atrás. */
export function Credits() {
  usePageTitle('Saldo');
  const { memberships, activeOrgId } = useAuth();
  const org = memberships.find((m) => m.orgId === activeOrgId);
  const timeZone = org?.timezone ?? 'UTC';

  const [credits, setCredits] = useState<CreditsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      setCredits(await api.me.credits());
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // La API ya devuelve los usables primero (FIFO): acá solo se separan las dos
  // secciones sin reordenar nada.
  const actives = (credits?.packs ?? []).filter((p) => p.status === 'active');
  const past = (credits?.packs ?? []).filter((p) => p.status !== 'active');

  const renderPack = (pack: CreditPackDto, index: number) => {
    const badge = STATUS_BADGE[pack.status] ?? STATUS_BADGE.active;
    const used = pack.total - pack.remaining;
    const ratio = pack.total > 0 ? used / pack.total : 0;
    const isFifo = pack.status === 'active' && pack.usableFrom === undefined && index === 0;

    return (
      <Card key={pack.id} className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-base font-semibold text-ink">{pack.name}</p>
            <p className="text-sm text-ink-muted">
              {pack.remaining} de {pack.total} clases
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            {isFifo && <Badge tone="accent">Se usa primero</Badge>}
          </div>
        </div>

        <div
          className="h-1.5 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-label={`Clases usadas de ${pack.name}`}
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={pack.total}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${String(Math.round(ratio * 100))}%` }}
          />
        </div>

        <p className="text-xs text-ink-dim">
          {pack.usableFrom
            ? `Disponible desde el ${shortDate(pack.usableFrom, timeZone)}`
            : `Vence el ${shortDate(pack.expiresAt, timeZone)} · ${expiryLabel(pack.expiresAt, timeZone)}`}
        </p>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Saldo</h1>

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : credits === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : credits.packs.length === 0 ? (
        <EmptyState
          title="No tenés packs activos"
          text="Pedile a tu gimnasio que te asigne uno."
        />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Podés reservar <span className="font-medium text-ink">{credits.totalRemaining}</span>{' '}
            {credits.totalRemaining === 1 ? 'clase' : 'clases'}.
          </p>

          {actives.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-ink-muted">Activos</h2>
              {actives.map(renderPack)}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowHistory((v) => !v);
                }}
                aria-expanded={showHistory}
                className="text-sm font-medium text-ink-muted hover:text-ink"
              >
                Historial ({past.length}) {showHistory ? '▲' : '▼'}
              </button>
              {showHistory && past.map((pack, i) => renderPack(pack, i + 1))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
