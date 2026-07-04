import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

/** Pill seleccionable (ej.: chips de porcentaje de la calculadora de cargas). */
export function Chip({ selected = false, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex h-9 items-center justify-center rounded-full px-3.5 text-sm font-medium transition-colors select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        selected
          ? 'bg-accent-soft text-accent-strong ring-1 ring-accent/40'
          : 'border border-line bg-surface text-ink-muted hover:bg-raised hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
