import { EmptyState } from '@bv/ui';
import { usePageTitle } from '../lib/usePageTitle';

/** Saldo de packs del atleta. Se completa en F4-06. */
export function Credits() {
  usePageTitle('Saldo');
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Saldo</h1>
      <EmptyState
        title="Sin packs cargados"
        text="Tus clases disponibles y sus vencimientos van a aparecer acá."
      />
    </div>
  );
}
