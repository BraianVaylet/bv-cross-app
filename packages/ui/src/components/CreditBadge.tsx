import { cx } from '../cx.js';
import { ymdInTz } from '../lib/agendaTime.js';
import { WalletIcon } from './Icons.js';

export interface CreditBadgeProps {
  /** Clases usables hoy (`totalRemaining` de `GET /me/credits`). */
  remaining: number;
  /** Vencimiento del pack que se consume primero (FIFO). ISO; opcional. */
  expiresAt?: string | null;
  /** Timezone del gimnasio: la fecha se muestra como la ve el box. */
  timeZone: string;
  onClick?: () => void;
}

/**
 * Saldo siempre a la vista (F4-04): el atleta decide si reserva mirando esto,
 * así que vive en el header de la grilla y no en otra pantalla.
 */
export function CreditBadge({ remaining, expiresAt, timeZone, onClick }: CreditBadgeProps) {
  const empty = remaining <= 0;
  // dd/mm armado desde la fecha de calendario de la org: `Intl` con es-AR
  // ignora `2-digit` y devuelve "1/8", que al lado de "01/08" se lee peor.
  const expiry = !empty && expiresAt ? ymdInTz(expiresAt, timeZone).slice(5).split('-').reverse().join('/') : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        empty
          ? 'bg-warn-soft text-warn hover:brightness-95'
          : 'bg-accent-soft text-accent-strong hover:brightness-95',
      )}
    >
      <WalletIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {empty ? (
        <span className="font-medium">Sin clases — hablá con tu gimnasio</span>
      ) : (
        <span className="font-medium">
          {remaining} {remaining === 1 ? 'clase' : 'clases'}
          {expiry && <span className="font-normal"> · vence {expiry}</span>}
        </span>
      )}
    </button>
  );
}
