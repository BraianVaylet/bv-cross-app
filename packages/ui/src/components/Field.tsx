import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../cx.js';

/** Shell compartido de campos: label + control + error/hint con aria correcto. */
export function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-dim">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCx = (hasError?: boolean) =>
  cx(
    'h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-dim',
    'outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25',
    hasError ? 'border-danger' : 'border-line',
  );

const ariaFor = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: ReactNode;
  suffix?: string;
};

export function Input({ label, error, hint, suffix, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          id={inputId}
          className={cx(inputCx(!!error), suffix && 'pr-10', className)}
          {...ariaFor(inputId, error)}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-dim">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: ReactNode;
};

export function Textarea({ label, error, hint, className, id, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint}>
      <textarea
        id={inputId}
        className={cx(
          'w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-dim',
          'outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25',
          error ? 'border-danger' : 'border-line',
          className,
        )}
        {...ariaFor(inputId, error)}
        {...rest}
      />
    </FieldShell>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  hint?: ReactNode;
};

export function Select({ label, error, hint, className, id, children, ...rest }: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} error={error} hint={hint}>
      <select
        id={inputId}
        className={cx(inputCx(!!error), 'appearance-none pr-9', className)}
        {...ariaFor(inputId, error)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
