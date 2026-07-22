import { ChevronLeftIcon } from '@bv/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
    >
      <ChevronLeftIcon className="h-4 w-4" />
      {children}
    </Link>
  );
}
