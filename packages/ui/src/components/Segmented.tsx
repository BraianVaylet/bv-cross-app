import { cx } from '../cx.js';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-sm font-medium text-ink-muted">{label}</span>}
      <div className="flex rounded-xl bg-raised p-1" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onChange(opt.value);
              }}
              className={cx(
                'h-9 flex-1 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
