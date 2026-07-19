import { Logo, LogoutIcon, MoonIcon, SunIcon } from '@bv/ui';
import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
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

/** Shell de la app: marca + org activa + tema + salir. */
export function AppLayout() {
  const { logout, memberships, activeOrgId } = useAuth();
  const navigate = useNavigate();
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Logo />
            <span className="font-display text-lg font-semibold text-ink">BV Cross</span>
          </Link>
          <div className="flex items-center gap-1">
            {activeOrg && (
              <span className="mr-1 hidden truncate rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-ink-muted sm:inline">
                {activeOrg.orgName}
              </span>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void onLogout()}
              aria-label="Cerrar sesión"
              className={headerBtn}
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
