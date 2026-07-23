import { cx } from '../cx.js';
import { Spinner } from './Button.js';
import { CheckIcon } from './Icons.js';

/**
 * Estado visual de una clase en la grilla (F4-04). Se calcula con
 * `sessionState()` para que agenda y CRM cuenten la misma historia.
 */
export type SessionState = 'available' | 'almost' | 'full' | 'booked' | 'cancelled' | 'past';

export interface SessionLike {
  startsAt: string; // ISO UTC
  status: 'scheduled' | 'cancelled';
  capacity: number;
  bookedCount: number;
  myBookingId: string | null;
}

/** Umbral de "casi llena": a partir de acá la ocupación se pinta en `warn`. */
export const ALMOST_FULL_RATIO = 0.8;

export type OccupancyTone = 'ok' | 'warn' | 'danger';

/**
 * Color de la ocupación, compartido por la agenda del atleta y el calendario
 * del CRM (F3-06): llena en `danger`, ≥80% en `warn`, el resto neutro. Un solo
 * lugar para que las dos apps cuenten lo mismo al dueño y al que reserva.
 */
export function occupancyTone(bookedCount: number, capacity: number): OccupancyTone {
  if (capacity <= 0 || bookedCount >= capacity) return 'danger';
  return bookedCount / capacity >= ALMOST_FULL_RATIO ? 'warn' : 'ok';
}

/**
 * Orden de precedencia pensado desde el atleta: primero lo que YA le pasó a él
 * (reservada), después lo que no puede cambiar (cancelada, pasada) y recién al
 * final el cupo. Una clase reservada que se llenó sigue mostrándose reservada.
 */
export function sessionState(session: SessionLike, now: Date = new Date()): SessionState {
  if (session.myBookingId) return 'booked';
  if (session.status === 'cancelled') return 'cancelled';
  if (Date.parse(session.startsAt) <= now.getTime()) return 'past';
  if (session.bookedCount >= session.capacity) return 'full';
  if (session.bookedCount / session.capacity >= ALMOST_FULL_RATIO) return 'almost';
  return 'available';
}

/** Estados en los que tocar la card no hace nada. */
export const isSelectable = (state: SessionState): boolean =>
  state === 'available' || state === 'almost';

const STATE_NOTE: Record<SessionState, string | null> = {
  available: null,
  almost: 'Quedan pocos lugares',
  full: 'Completa',
  booked: 'Estás anotado',
  cancelled: 'Cancelada por el gimnasio',
  past: 'Ya pasó',
};

export interface SessionCardProps {
  /** Hora `HH:mm` YA convertida a la tz del gimnasio (`timeInTz`). */
  time: string;
  discipline: string;
  description?: string;
  bookedCount: number;
  capacity: number;
  state: SessionState;
  /** Reserva en curso: la card espera el 201, no se adelanta. */
  loading?: boolean;
  onSelect?: () => void;
}

export function SessionCard({
  time,
  discipline,
  description,
  bookedCount,
  capacity,
  state,
  loading = false,
  onSelect,
}: SessionCardProps) {
  const selectable = isSelectable(state) && !loading;
  const ratio = capacity > 0 ? Math.min(bookedCount / capacity, 1) : 1;
  const note = STATE_NOTE[state];
  const muted = state === 'past' || state === 'cancelled';

  return (
    <button
      type="button"
      disabled={!selectable}
      aria-busy={loading || undefined}
      onClick={selectable ? onSelect : undefined}
      className={cx(
        'w-full rounded-2xl border p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        state === 'booked'
          ? 'border-accent bg-accent-soft/40'
          : 'border-line bg-surface',
        selectable && 'hover:bg-raised',
        muted && 'opacity-60',
        !selectable && 'cursor-default',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={cx('font-display text-lg font-semibold text-ink', state === 'cancelled' && 'line-through')}>
            {time}
          </span>
          <span className="text-sm font-medium text-ink-muted">{discipline}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <Spinner className="h-4 w-4 text-ink-muted" />}
          {state === 'booked' && !loading && <CheckIcon className="h-4 w-4 text-accent" />}
          <span
            className={cx(
              'text-xs font-medium tabular-nums',
              ratio >= ALMOST_FULL_RATIO ? 'text-warn' : 'text-ink-muted',
            )}
          >
            {bookedCount}/{capacity}
          </span>
        </div>
      </div>

      {description && <p className="mt-1 line-clamp-1 text-sm text-ink-muted">{description}</p>}

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-label="Ocupación"
        aria-valuenow={bookedCount}
        aria-valuemin={0}
        aria-valuemax={capacity}
      >
        <div
          className={cx('h-full rounded-full', ratio >= ALMOST_FULL_RATIO ? 'bg-warn' : 'bg-accent')}
          style={{ width: `${String(Math.round(ratio * 100))}%` }}
        />
      </div>

      {note && (
        <p
          className={cx(
            'mt-2 text-xs font-medium',
            state === 'booked' ? 'text-accent' : state === 'almost' ? 'text-warn' : 'text-ink-dim',
          )}
        >
          {note}
        </p>
      )}
    </button>
  );
}
