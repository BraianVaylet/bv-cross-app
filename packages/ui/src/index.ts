export { cx } from './cx.js';
export { Button, buttonCx, Spinner, FullScreenSpinner } from './components/Button.js';
export type { ButtonProps, ButtonSize, ButtonVariant } from './components/Button.js';
export { FieldShell, Input, Select, Textarea, inputCx } from './components/Field.js';
export type { InputProps, SelectProps, TextareaProps } from './components/Field.js';
export { Card, EmptyState, ErrorBanner, Skeleton } from './components/Card.js';
export { Badge } from './components/Badge.js';
export type { BadgeTone } from './components/Badge.js';
export { Chip } from './components/Chip.js';
export type { ChipProps } from './components/Chip.js';
export { Segmented } from './components/Segmented.js';
export { Modal } from './components/Modal.js';
export { ConfirmDialog } from './components/ConfirmDialog.js';
export { ToastProvider, useToast } from './components/Toast.js';
export type { ToastVariant } from './components/Toast.js';
export { Logo } from './components/Logo.js';
export * from './components/Icons.js';
// Agenda (F4-04): grilla semanal, card de clase y saldo. La aritmética de
// fechas se exporta desde acá para que agenda y CRM usen la misma (F3-06).
export { WeekGrid } from './components/WeekGrid.js';
export type { WeekGridProps } from './components/WeekGrid.js';
export {
  SessionCard,
  sessionState,
  isSelectable,
  ALMOST_FULL_RATIO,
} from './components/SessionCard.js';
export type { SessionCardProps, SessionLike, SessionState } from './components/SessionCard.js';
export { CreditBadge } from './components/CreditBadge.js';
export type { CreditBadgeProps } from './components/CreditBadge.js';
export * from './lib/agendaTime.js';
