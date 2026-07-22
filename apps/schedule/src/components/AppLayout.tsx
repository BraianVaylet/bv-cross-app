import { CalendarIcon, ListIcon, Logo, MoonIcon, SunIcon, UserIcon, WalletIcon } from '@bv/ui';
import { useState, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const headerBtn =
  'flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink';

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('bv-theme', next ? 'dark' : 'light');
    } catch {
      /* storage no disponible */
    }
    setDark(next);
  };
  return (
    <button type="button" onClick={toggle} aria-label="Cambiar tema" className={headerBtn}>
      {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Las cuatro pantallas de la app del atleta (docs/tasks/F4.md F4-03). */
const NAV: NavItem[] = [
  { to: '/', label: 'Grilla', Icon: CalendarIcon },
  { to: '/bookings', label: 'Mis reservas', Icon: ListIcon },
  { to: '/credits', label: 'Saldo', Icon: WalletIcon },
  { to: '/account', label: 'Cuenta', Icon: UserIcon },
];

/**
 * Barra inferior: el pulgar llega a todo. `end` en "/" para que la grilla no
 * quede marcada como activa en el resto de las rutas.
 */
function BottomNav() {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-md">
        {NAV.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            {/* NavLink pone `aria-current="page"` solo en el activo. */}
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-ink-muted hover:text-ink',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shell de la app: marca + org activa + tema arriba, navegación abajo. */
export function AppLayout() {
  const { user, memberships, activeOrgId } = useAuth();
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId);
  const initial = (user?.name.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Logo label="BV Agenda" />
            <span className="font-display text-lg font-semibold text-ink">BV Agenda</span>
          </Link>
          <div className="flex items-center gap-1">
            {activeOrg && (
              <Link
                to="/select-org"
                title="Cambiar o sumar gimnasio"
                className="mr-1 hidden max-w-[10rem] truncate rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink sm:inline"
              >
                {activeOrg.orgName}
              </Link>
            )}
            <ThemeToggle />
            <Link
              to="/account"
              aria-label="Tu cuenta"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent transition-transform hover:scale-105"
            >
              {initial}
            </Link>
          </div>
        </header>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
