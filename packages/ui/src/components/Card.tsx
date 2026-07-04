import type { ReactNode } from 'react';
import { cx } from '../cx.js';
import { AlertIcon } from './Icons.js';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-danger"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-xl bg-raised', className)} />;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-ink-dim">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {text && <p className="max-w-xs text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
