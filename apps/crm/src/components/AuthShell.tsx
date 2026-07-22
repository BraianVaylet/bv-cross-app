import { Card, Logo } from '@bv/ui';
import type { ReactNode } from 'react';

/** Layout de las pantallas de autenticación (marca + card centrada). */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo label="BV CRM" />
          <p className="text-sm font-medium text-ink-dim">BV CRM</p>
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <Card>{children}</Card>
        {footer && <p className="text-center text-sm text-ink-muted">{footer}</p>}
      </div>
    </div>
  );
}
