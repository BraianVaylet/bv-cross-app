import { EmptyState } from '@bv/ui';
import { usePageTitle } from '../lib/usePageTitle';

/**
 * Página en construcción: el shell y la navegación ya funcionan, cada sección
 * llega en su tarea (F3-05..F3-11). El texto dice cuál para que no parezca un
 * error de la app.
 */
export function Placeholder({ title, task }: { title: string; task: string }) {
  usePageTitle(title);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      <EmptyState title="Todavía no está lista" text={`Esta sección llega en ${task}.`} />
    </div>
  );
}
