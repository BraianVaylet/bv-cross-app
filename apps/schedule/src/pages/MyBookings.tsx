import type { BookingWithSessionDto, CreditsDto } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Segmented,
  Skeleton,
  cancellationDeadline,
  isCancellable,
  shortDate,
  timeInTz,
  useToast,
  ymdInTz,
} from '@bv/ui';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

type Scope = 'upcoming' | 'history';

const STATUS_BADGE: Record<string, { tone: 'neutral' | 'ok' | 'warn' | 'danger'; label: string }> = {
  booked: { tone: 'neutral', label: 'Anotado' },
  attended: { tone: 'ok', label: 'Asististe' },
  no_show: { tone: 'warn', label: 'No fuiste' },
  cancelled_by_user: { tone: 'neutral', label: 'La cancelaste' },
  cancelled_by_gym: { tone: 'danger', label: 'La canceló el gimnasio' },
};

/** Reservas del atleta (F4-05): próximas con su ventana, e historial. */
export function MyBookings() {
  usePageTitle('Mis reservas');
  const { memberships, activeOrgId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const org = memberships.find((m) => m.orgId === activeOrgId);
  const timeZone = org?.timezone ?? 'UTC';
  const windowHours = org?.cancellationWindowHours ?? 0;

  const [scope, setScope] = useState<Scope>('upcoming');
  const [items, setItems] = useState<BookingWithSessionDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsDto | null>(null);
  const [pending, setPending] = useState<BookingWithSessionDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** El mismo flujo de cancelar, pero volviendo a la grilla para elegir otra. */
  const [reschedule, setReschedule] = useState(false);

  const load = useCallback(
    async (target: Scope): Promise<void> => {
      setLoadError(null);
      setItems(null);
      try {
        const page = await api.me.bookings({ scope: target, limit: 20 });
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
    },
    [],
  );

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  useEffect(() => {
    void (async () => {
      try {
        setCredits(await api.me.credits());
      } catch {
        // El saldo solo sirve para advertir sobre packs vencidos: si falla, se omite.
      }
    })();
  }, []);

  const loadMore = async (): Promise<void> => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.me.bookings({ scope, after: cursor, limit: 20 });
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * El crédito vuelve al pack de ORIGEN (RN-08): si ese pack ya venció, la
   * clase vuelve pero no se puede usar. Se avisa antes de cancelar, no después.
   */
  const refundGoesToDeadPack = (booking: BookingWithSessionDto): boolean => {
    const pack = credits?.packs.find((p) => p.id === booking.packAssignmentId);
    return pack !== undefined && pack.status !== 'active' && pack.status !== 'exhausted';
  };

  const packNameOf = (booking: BookingWithSessionDto): string | null =>
    credits?.packs.find((p) => p.id === booking.packAssignmentId)?.name ?? null;

  const confirmCancel = async (): Promise<void> => {
    if (!pending) return;
    const target = pending;
    setCancelling(true);
    try {
      await api.bookings.cancel(target.id);
      setItems((prev) => (prev ?? []).filter((b) => b.id !== target.id));
      setCredits((prev) =>
        prev ? { ...prev, totalRemaining: prev.totalRemaining + 1 } : prev,
      );
      setPending(null);
      toast.show('Reserva cancelada. Te devolvimos la clase.');
    } catch (err) {
      setPending(null);
      if (err instanceof ApiError && err.code === 'CANCELLATION_WINDOW_CLOSED') {
        // Carrera entre el reloj del cliente y el del servidor: el servidor manda.
        toast.show('Se cerró la ventana de cancelación para esa clase.', 'danger');
        await load(scope);
      } else {
        toast.show(errorMessage(err), 'danger');
      }
    } finally {
      setCancelling(false);
    }
  };

  /** Cambiar de horario = cancelar y volver a la grilla en ese mismo día. */
  const rescheduleFrom = (booking: BookingWithSessionDto): void => {
    setReschedule(true);
    setPending(booking);
  };

  const afterCancelNavigate = (booking: BookingWithSessionDto): void => {
    void navigate(`/?day=${ymdInTz(booking.session.startsAt, timeZone)}`);
  };

  const renderUpcoming = (booking: BookingWithSessionDto) => {
    const { session } = booking;
    const open = isCancellable(session.startsAt, windowHours);
    const deadline = cancellationDeadline(session.startsAt, windowHours);
    return (
      <Card key={booking.id} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              {timeInTz(session.startsAt, timeZone)}
            </p>
            <p className="text-sm text-ink-muted">
              {shortDate(session.startsAt, timeZone)} · {session.discipline}
            </p>
          </div>
          <Badge tone="accent">Anotado</Badge>
        </div>

        <p className={open ? 'text-xs text-ink-dim' : 'text-xs font-medium text-warn'}>
          {open
            ? `Podés cancelar hasta las ${timeInTz(deadline, timeZone)}`
            : 'Ya no se puede cancelar'}
        </p>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!open}
            onClick={() => {
              setReschedule(false);
              setPending(booking);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="ghost"
            disabled={!open}
            onClick={() => {
              rescheduleFrom(booking);
            }}
          >
            Cambiar de horario
          </Button>
        </div>
      </Card>
    );
  };

  const renderHistory = (booking: BookingWithSessionDto) => {
    const badge = STATUS_BADGE[booking.status] ?? STATUS_BADGE.booked;
    return (
      <Card key={booking.id} className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {shortDate(booking.session.startsAt, timeZone)}{' '}
            <span className="text-ink-muted">
              {timeInTz(booking.session.startsAt, timeZone)} · {booking.session.discipline}
            </span>
          </p>
        </div>
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </Card>
    );
  };

  const packName = pending ? packNameOf(pending) : null;
  const deadPack = pending ? refundGoesToDeadPack(pending) : false;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Mis reservas</h1>

      <Segmented<Scope>
        options={[
          { value: 'upcoming', label: 'Próximas' },
          { value: 'history', label: 'Historial' },
        ]}
        value={scope}
        onChange={setScope}
      />

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load(scope)}>
            Reintentar
          </Button>
        </div>
      ) : items === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={scope === 'upcoming' ? 'No tenés clases anotadas' : 'Todavía no hay historial'}
          text={
            scope === 'upcoming'
              ? 'Anotate desde la grilla y la vas a ver acá.'
              : 'Acá van a aparecer las clases que hiciste y las que cancelaste.'
          }
          {...(scope === 'upcoming'
            ? {
                action: (
                  <Button
                    onClick={() => {
                      void navigate('/');
                    }}
                  >
                    Ver la grilla
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-2">
          {items.map((booking) =>
            scope === 'upcoming' ? renderUpcoming(booking) : renderHistory(booking),
          )}
          {cursor && (
            <Button variant="secondary" full loading={loadingMore} onClick={() => void loadMore()}>
              Cargar más
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={reschedule ? 'Cambiar de horario' : 'Cancelar la reserva'}
        message={
          deadPack
            ? `El crédito vuelve a ${packName ?? 'un pack'} que ya venció: no vas a poder usarlo.`
            : `Se te devuelve 1 clase${packName ? ` al pack ${packName}` : ''}.`
        }
        confirmLabel={reschedule ? 'Cancelar y elegir otra' : 'Sí, cancelar'}
        cancelLabel="Volver"
        loading={cancelling}
        onCancel={() => {
          setPending(null);
          setReschedule(false);
        }}
        onConfirm={() => {
          const target = pending;
          const goToGrid = reschedule;
          void confirmCancel().then(() => {
            if (goToGrid && target) afterCancelNavigate(target);
          });
        }}
      />
    </div>
  );
}
