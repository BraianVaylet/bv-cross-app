import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '../cx.js';

export type ToastVariant = 'ok' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, variant: ToastVariant = 'ok') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cx(
                'pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg',
                t.variant === 'ok' && 'border-line bg-surface text-ink',
                t.variant === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
                t.variant === 'info' && 'border-info/30 bg-info-soft text-info',
              )}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return api;
}
