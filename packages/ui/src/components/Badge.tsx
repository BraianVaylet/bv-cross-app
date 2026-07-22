import type { ReactNode } from 'react';
import { cx } from '../cx.js';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

// `ok` y `danger` no tienen token `-soft` en el DS: se usa el color con
// opacidad, que se adapta solo a los dos temas.
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-ink-muted',
  accent: 'bg-accent-soft text-accent-strong',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger/15 text-danger',
};

/**
 * Etiqueta de estado, no accionable (a diferencia de `Chip`): estado de una
 * reserva en el historial (F4-05) o de un pack en el saldo (F4-06).
 */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
