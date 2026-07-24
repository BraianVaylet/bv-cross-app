import {
  AppShell,
  BarbellIcon,
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
  type AppShellNavItem,
} from '@bv/ui';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { resolveAdminAccess } from '../auth/adminAccess';

/**
 * Las 5 primeras entran en la barra del teléfono; el resto vive detrás de
 * "Más" (docs/tasks/F3.md F3-04).
 */
const NAV: AppShellNavItem[] = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon },
  { to: '/clients', label: 'Clientes', Icon: UsersIcon },
  { to: '/classes', label: 'Clases', Icon: CalendarIcon },
  { to: '/packs', label: 'Packs', Icon: WalletIcon },
  { to: '/exercises', label: 'Ejercicios', Icon: BarbellIcon, primary: false },
  { to: '/stats', label: 'Estadísticas', Icon: ChartIcon, primary: false },
  { to: '/settings', label: 'Configuración', Icon: SettingsIcon, primary: false },
];

export function CrmLayout() {
  const { user, memberships, activeOrgId, selectOrg, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const access = resolveAdminAccess(memberships);
  const adminOrgs = access.kind === 'ready' ? access.memberships : [];

  return (
    <AppShell
      appName="BV CRM"
      nav={NAV}
      currentPath={location.pathname}
      renderLink={({ to, className, active, children }) => (
        <Link to={to} className={className} aria-current={active ? 'page' : undefined}>
          {children}
        </Link>
      )}
      orgs={adminOrgs.map((m) => ({ id: m.orgId, name: m.orgName }))}
      activeOrgId={activeOrgId}
      onSelectOrg={selectOrg}
      {...(user?.name !== undefined ? { userName: user.name } : {})}
      onLogout={() => {
        void logout().then(() => {
          void navigate('/login', { replace: true });
        });
      }}
    >
      <Outlet />
    </AppShell>
  );
}
