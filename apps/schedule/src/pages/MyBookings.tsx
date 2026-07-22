import { EmptyState } from '@bv/ui';
import { usePageTitle } from '../lib/usePageTitle';

/** Reservas del atleta (próximas e historial). Se completa en F4-05. */
export function MyBookings() {
  usePageTitle('Mis reservas');
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Mis reservas</h1>
      <EmptyState
        title="Sin reservas"
        text="Cuando te anotes a una clase la vas a ver acá, con el plazo para cancelar."
      />
    </div>
  );
}
