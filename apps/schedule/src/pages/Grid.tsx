import type { CreditsDto, SessionDto } from '@bv/contracts';
import {
  Button,
  CreditBadge,
  EmptyState,
  ErrorBanner,
  Modal,
  SessionCard,
  Skeleton,
  WeekGrid,
  groupByDayInTz,
  isSelectable,
  sessionState,
  startOfWeekYmd,
  timeInTz,
  todayInTz,
  weekDays,
  useToast,
} from '@bv/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

/**
 * La pantalla más usada del producto (F4-04): ver la semana y reservar en
 * menos de 10 segundos y 3 taps. Desde la app abierta son dos: la clase y
 * "Reservar".
 */
export function Grid() {
  usePageTitle('Grilla');
  const { memberships, activeOrgId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const org = memberships.find((m) => m.orgId === activeOrgId);
  const timeZone = org?.timezone ?? 'UTC';
  const horizonDays = org?.sessionGenerationDays ?? 14;

  const today = useMemo(() => todayInTz(timeZone), [timeZone]);
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [credits, setCredits] = useState<CreditsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<SessionDto | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [noCredits, setNoCredits] = useState(false);

  const loadWeek = useCallback(async (): Promise<void> => {
    const from = days[0];
    const to = days[6];
    if (!from || !to) return;
    setLoadError(null);
    try {
      const { items } = await api.sessions.list(from, to);
      setSessions(items);
    } catch (err) {
      setSessions(null);
      setLoadError(errorMessage(err));
    }
  }, [days]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    void (async () => {
      try {
        setCredits(await api.me.credits());
      } catch {
        // El saldo es contexto, no bloquea la grilla: si falla, no se muestra.
      }
    })();
  }, []);

  const byDay = useMemo(
    () => groupByDayInTz(sessions ?? [], timeZone),
    [sessions, timeZone],
  );
  const countsByDay = useMemo(
    () => Object.fromEntries([...byDay].map(([day, list]) => [day, list.length])),
    [byDay],
  );
  const daySessions = byDay.get(selectedDay) ?? [];

  // El horizonte de materialización manda: más allá no hay nada que reservar.
  const lastBookable = useMemo(() => {
    const limit = new Date(Date.parse(`${today}T12:00:00Z`) + horizonDays * 86_400_000);
    return limit.toISOString().slice(0, 10);
  }, [today, horizonDays]);
  const canGoNext = (days[6] ?? '') < lastBookable;
  const canGoPrev = weekStart > startOfWeekYmd(today);

  const moveWeek = (delta: number): void => {
    const next = new Date(Date.parse(`${weekStart}T12:00:00Z`) + delta * 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    setWeekStart(next);
    setSelectedDay(next);
  };

  /** Marca la sesión como reservada en memoria, sin volver a pedir la semana. */
  const markBooked = (sessionId: string, bookingId: string, bookedCount: number): void => {
    setSessions((prev) =>
      (prev ?? []).map((s) =>
        s.id === sessionId ? { ...s, bookedCount, myBookingId: bookingId } : s,
      ),
    );
  };

  const confirmBooking = async (): Promise<void> => {
    if (!pending) return;
    const target = pending;
    setBooking(target.id);
    setPending(null);
    try {
      const res = await api.bookings.create(target.id);
      markBooked(target.id, res.booking.id, res.session.bookedCount);
      // El saldo se actualiza con la respuesta del POST: un crédito menos.
      setCredits((prev) =>
        prev ? { ...prev, totalRemaining: Math.max(prev.totalRemaining - 1, 0) } : prev,
      );
      toast.show('¡Listo! Estás anotado.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_BOOKED') {
        // Idempotencia visual: ya estaba anotado, la card lo refleja.
        await loadWeek();
        toast.show('Ya estabas anotado en esa clase.');
      } else if (err instanceof ApiError && err.code === 'SESSION_FULL') {
        await loadWeek(); // que vea el cupo real, no un número viejo
        toast.show('Se llenó justo ahora 😞', 'danger');
      } else if (err instanceof ApiError && err.code === 'NO_CREDITS') {
        setNoCredits(true);
      } else {
        toast.show(errorMessage(err), 'danger');
      }
    } finally {
      setBooking(null);
    }
  };

  // Pack que se va a consumir (FIFO): el primero usable de /me/credits.
  const fifoPack = credits?.packs.find((p) => p.usableFrom === undefined && p.remaining > 0);

  return (
    <div className="space-y-4">
      {credits && (
        <CreditBadge
          remaining={credits.totalRemaining}
          expiresAt={credits.nextExpiration}
          timeZone={timeZone}
          onClick={() => {
            navigate('/credits');
          }}
        />
      )}

      <WeekGrid
        days={days}
        selected={selectedDay}
        today={today}
        countsByDay={countsByDay}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onSelectDay={setSelectedDay}
        onPrevWeek={() => {
          moveWeek(-1);
        }}
        onNextWeek={() => {
          moveWeek(1);
        }}
      >
        {loadError ? (
          <div className="space-y-3">
            <ErrorBanner>{loadError}</ErrorBanner>
            <Button variant="secondary" onClick={() => void loadWeek()}>
              Reintentar
            </Button>
          </div>
        ) : sessions === null ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : daySessions.length === 0 ? (
          <EmptyState
            title="No hay clases este día"
            text={
              canGoNext
                ? 'Probá con otro día de la semana.'
                : `Las reservas se abren ${String(horizonDays)} días antes.`
            }
          />
        ) : (
          <ul className="space-y-2">
            {daySessions.map((session) => {
              const state = sessionState(session);
              return (
                <li key={session.id}>
                  <SessionCard
                    time={timeInTz(session.startsAt, timeZone)}
                    discipline={session.discipline}
                    {...(session.description !== undefined
                      ? { description: session.description }
                      : {})}
                    bookedCount={session.bookedCount}
                    capacity={session.capacity}
                    state={state}
                    loading={booking === session.id}
                    onSelect={
                      isSelectable(state)
                        ? () => {
                            setPending(session);
                          }
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </WeekGrid>

      <Modal
        open={pending !== null}
        title="Confirmar reserva"
        onClose={() => {
          setPending(null);
        }}
      >
        {pending && (
          <div className="space-y-4">
            <p className="text-ink">
              <span className="font-display text-lg font-semibold">
                {timeInTz(pending.startsAt, timeZone)}
              </span>{' '}
              · {pending.discipline}
            </p>
            {fifoPack ? (
              <p className="text-sm text-ink-muted">
                Se descuenta de: <span className="font-medium text-ink">{fifoPack.name}</span> — te
                quedan {fifoPack.remaining - 1}.
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Se descuenta del pack que vence primero.</p>
            )}
            <Button full onClick={() => void confirmBooking()}>
              Reservar
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={noCredits}
        title="Sin clases disponibles"
        onClose={() => {
          setNoCredits(false);
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            No te quedan clases para reservar. Comprá un pack en tu gimnasio y volvé a intentar.
          </p>
          <Button
            full
            onClick={() => {
              setNoCredits(false);
              navigate('/credits');
            }}
          >
            Ver mi saldo
          </Button>
        </div>
      </Modal>
    </div>
  );
}
