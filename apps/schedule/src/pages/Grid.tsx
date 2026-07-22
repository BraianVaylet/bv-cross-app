import { EmptyState } from '@bv/ui';
import { usePageTitle } from '../lib/usePageTitle';

/** Grilla semanal de clases. La reserva real llega en F4-04. */
export function Grid() {
  usePageTitle('Grilla');
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Grilla</h1>
      <EmptyState
        title="Todavía no hay grilla"
        text="Acá vas a ver las clases de la semana y reservar tu lugar."
      />
    </div>
  );
}
