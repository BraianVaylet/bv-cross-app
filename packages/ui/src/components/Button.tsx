import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'sm';

export function buttonCx(
  opts: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    full?: boolean;
  } = {},
): string {
  const { variant = 'primary', size = 'md', full = false } = opts;
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
    'disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' && 'h-9 px-3 text-sm',
    size === 'md' && 'h-11 px-4 text-[15px]',
    size === 'lg' && 'h-12 px-5 text-base',
    full && 'w-full',
    variant === 'primary' &&
      'bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-strong',
    variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-raised',
    variant === 'ghost' && 'text-ink-muted hover:bg-raised hover:text-ink',
    variant === 'danger' && 'bg-danger text-white hover:opacity-90',
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
};

export function Button({
  variant,
  size,
  full,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? 'button'}
      className={cx(buttonCx({ variant, size, full }), className)}
      disabled={disabled ?? loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      data-testid="spinner"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-accent">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
