import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Prompt de actualización de la PWA (F2-06). Con registerType 'prompt' el SW
 * nuevo espera; cuando hay una versión disponible mostramos un aviso y el
 * usuario actualiza con un toque (evita quedarse con el JS viejo en silencio).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-lg">
        <p className="flex-1 text-sm text-ink">Hay una versión nueva de BV Cross.</p>
        <button
          type="button"
          onClick={() => {
            setNeedRefresh(false);
          }}
          className="h-9 rounded-xl px-3 text-sm font-medium text-ink-muted hover:text-ink"
        >
          Después
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="h-9 rounded-xl bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
