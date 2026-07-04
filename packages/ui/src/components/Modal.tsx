import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../cx.js';
import { CloseIcon } from './Icons.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal accesible: Escape y click en overlay cierran, el scroll del body se
 * bloquea, el foco entra al panel al abrir y Tab cicla adentro (trap).
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Foco inicial: primer focusable del panel, o el panel mismo.
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Trap de foco: Tab/Shift+Tab ciclan dentro del panel.
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (!firstEl || !lastEl) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panelRef.current)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      data-testid="modal-overlay"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          'w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl outline-none',
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {title && (
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
