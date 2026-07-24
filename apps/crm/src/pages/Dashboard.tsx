import type { DashboardDto } from '@bv/contracts';
import {
  ALMOST_FULL_RATIO,
  AlertIcon,
  CalendarIcon,
  Card,
  ErrorBanner,
  Skeleton,
  StatCard,
  UsersIcon,
  WalletIcon,
  timeInTz,
} from '@bv/ui';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

/** Pesos sin decimales: los packs no se cobran con centavos. */
const money = (n: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-07-01" → "julio 2026". */
const mesLabel = (ymd: string): string => {
  const [year, month] = ymd.split('-');
  return `${MESES[Number(month) - 1] ?? ''} ${year ?? ''}`;
};

/** "2026-07-21" → "21/07". */
const ddmm = (ymd: string): string => ymd.slice(5).split('-').reverse().join('/');

const vencimientoLabel = (dias: number): string => {
  if (dias <= 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  return `vence en ${String(dias)} días`;
};

const inactividadLabel = (dias: number, nunca: boolean): string =>
  nunca ? `nunca reservó — ${String(dias)} días de alta` : `hace ${String(dias)} días`;

/** Una fila clickeable de las tres listas. */
function Fila({
  onClick,
  titulo,
  detalle,
  derecha,
  tono,
}: {
  onClick: () => void;
  titulo: string;
  detalle: string;
  derecha: string;
  tono?: 'warn' | 'danger';
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{titulo}</span>
          <span className="block truncate text-xs text-ink-muted">{detalle}</span>
        </span>
        <span
          className={
            tono === 'danger'
              ? 'shrink-0 text-sm font-medium text-danger'
              : tono === 'warn'
                ? 'shrink-0 text-sm font-medium text-warn'
                : 'shrink-0 text-sm font-medium text-ink-muted'
          }
        >
          {derecha}
        </span>
      </button>
    </li>
  );
}

/** Bloque con título y, si no hay nada, un empty state que no suena a error. */
function Bloque({
  titulo,
  vacio,
  children,
}: {
  titulo: string;
  vacio: string;
  children: React.ReactNode;
}) {
  const hayFilas = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card className="flex flex-col gap-1">
      <h2 className="px-3 pt-1 font-display text-base font-semibold text-ink">{titulo}</h2>
      {hayFilas ? (
        <ul className="flex flex-col">{children}</ul>
      ) : (
        <p className="px-3 pb-2 pt-1 text-sm text-ink-muted">{vacio}</p>
      )}
    </Card>
  );
}

/**
 * Dashboard del CRM (F3-10): lo que se mira al abrir el día.
 *
 * Las tres listas son accionables — cada fila lleva a donde se resuelve el
 * problema— y por eso el empty state es una buena noticia y no un hueco:
 * "nadie por vencer" es información, no ausencia de información.
 */
export function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { memberships, activeOrgId } = useAuth();
  // Los horarios se muestran SIEMPRE en la tz del gimnasio, nunca en la del
  // dispositivo (docs/02-arquitectura.md §7).
  const timeZone = memberships.find((m) => m.orgId === activeOrgId)?.timezone ?? 'UTC';

  const [data, setData] = useState<DashboardDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const { dashboard } = await api.stats.dashboard();
      setData(dashboard);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
        <ErrorBanner>{loadError}</ErrorBanner>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { today, week, month, expiringAssignments, inactiveMembers } = data;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Ingresos del mes"
          value={money(month.revenue)}
          hint={mesLabel(month.from)}
          icon={<WalletIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Nuevos miembros"
          value={String(month.newMembers)}
          hint={mesLabel(month.from)}
          icon={<UsersIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Reservas de la semana"
          value={String(week.bookings)}
          hint={
            week.cancellations > 0
              ? `${String(week.cancellations)} cancelaciones · ${ddmm(week.from)}–${ddmm(week.to)}`
              : `${ddmm(week.from)}–${ddmm(week.to)}`
          }
          icon={<CalendarIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Hoy" vacio="Hoy no hay clases en la grilla.">
          {today.sessions.map((s) => {
            const lleno = s.bookedCount >= s.capacity;
            const casi = !lleno && s.bookedCount / s.capacity >= ALMOST_FULL_RATIO;
            return (
              <Fila
                key={s.id}
                onClick={() => {
                  navigate('/classes');
                }}
                titulo={`${timeInTz(s.startsAt, timeZone)} · ${s.discipline}`}
                detalle={lleno ? 'completa' : casi ? 'casi completa' : 'con lugar'}
                derecha={`${String(s.bookedCount)}/${String(s.capacity)}`}
                {...(lleno ? { tono: 'danger' as const } : casi ? { tono: 'warn' as const } : {})}
              />
            );
          })}
        </Bloque>

        <Bloque titulo="Vencen esta semana" vacio="Nadie por vencer 🎉">
          {expiringAssignments.map((a) => (
            <Fila
              key={a.assignmentId}
              onClick={() => {
                navigate(`/clients/${a.membershipId}`);
              }}
              titulo={a.memberName}
              detalle={`${a.packName} · ${String(a.remaining)} clases sin usar`}
              derecha={vencimientoLabel(a.daysLeft)}
              tono={a.daysLeft <= 2 ? 'danger' : 'warn'}
            />
          ))}
        </Bloque>

        <Bloque titulo="Sin actividad 14+ días" vacio="Están viniendo todos 💪">
          {inactiveMembers.map((m) => (
            <Fila
              key={m.membershipId}
              onClick={() => {
                navigate(`/clients/${m.membershipId}`);
              }}
              titulo={m.memberName}
              detalle={m.lastBookingAt ? 'última reserva' : 'sin ninguna reserva'}
              derecha={inactividadLabel(m.daysInactive, m.lastBookingAt === null)}
              tono="warn"
            />
          ))}
        </Bloque>

        <Card className="flex items-start gap-2.5">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim" aria-hidden="true" />
          <p className="text-sm text-ink-muted">
            Los números son de <strong className="text-ink">{today.date.split('-').reverse().join('/')}</strong> en
            el horario del gimnasio, no en el de tu dispositivo. Las tres listas son accionables:
            tocá una fila para ir a resolverla.
          </p>
        </Card>
      </div>
    </div>
  );
}
