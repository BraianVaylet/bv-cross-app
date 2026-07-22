import { Button, Card } from '@bv/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Red de contención global (F3-04): un error de render no puede dejar al dueño
 * mirando una pantalla en blanco mientras atiende gente.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sin Sentry todavía (F5-03): por ahora, la consola.
    console.error('error de render', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <Card className="space-y-4 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Se rompió algo</h1>
          <p className="text-sm text-ink-muted">
            No es culpa tuya. Recargá la página; si vuelve a pasar, avisanos.
          </p>
          <Button
            full
            onClick={() => {
              window.location.reload();
            }}
          >
            Recargar
          </Button>
        </Card>
      </div>
    );
  }
}
