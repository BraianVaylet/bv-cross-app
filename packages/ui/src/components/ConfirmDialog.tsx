import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { Modal } from './Modal.js';

/**
 * Confirmación para acciones destructivas o con costo (docs/04-design-system.md §6).
 * `danger` (default true) pinta el botón de confirmación como destructivo.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  loading,
  children,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  /** Contenido extra entre el mensaje y los botones (un campo, un detalle). */
  children?: ReactNode;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} className="max-w-sm">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-muted">{message}</p>
      {/* Para confirmaciones que piden un dato (ej.: el motivo de una anulación). */}
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-5 flex gap-2.5">
        <Button variant="secondary" full onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          full
          onClick={onConfirm}
          loading={loading}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
