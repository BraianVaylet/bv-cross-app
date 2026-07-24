import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export interface StatCardProps {
  label: string;
  /** El número ya formateado: la card no sabe de monedas ni de unidades. */
  value: string;
  /** Contexto debajo del número ("julio 2026", "esta semana"). */
  hint?: string;
  /**
   * Variación contra el período anterior, en porcentaje. Positivo sube.
   * `undefined` = no hay con qué comparar, y entonces no se muestra nada:
   * un "0%" inventado se lee como un dato y no lo es.
   */
  delta?: number;
  /** Cómo leer el delta: en cancelaciones, subir es malo. */
  deltaMeaning?: 'up-good' | 'up-bad';
  icon?: ReactNode;
}

/**
 * Un número grande del dashboard (F3-10).
 *
 * El valor va en la display serif y en tamaño grande porque estas cards se
 * miran de reojo: el dueño abre el CRM, ve tres números y sigue. Todo lo demás
 * —label, contexto, variación— es secundario y va en el tamaño de siempre.
 */
export function StatCard({ label, value, hint, delta, deltaMeaning = 'up-good', icon }: StatCardProps) {
  const bueno = delta === undefined ? null : deltaMeaning === 'up-bad' ? delta <= 0 : delta >= 0;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{label}</span>
        {icon && <span className="text-ink-dim">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {hint && <span className="text-ink-dim">{hint}</span>}
        {delta !== undefined && (
          <span
            className={cx('font-medium', bueno ? 'text-accent-strong' : 'text-warn')}
            // El signo solo no alcanza si el color no se distingue.
            aria-label={`${delta >= 0 ? 'sube' : 'baja'} ${Math.abs(delta)} por ciento`}
          >
            {delta >= 0 ? '+' : '−'}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}
