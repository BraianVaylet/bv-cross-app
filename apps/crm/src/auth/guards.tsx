import { FullScreenSpinner } from '@bv/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { resolveAdminAccess } from './adminAccess';

/**
 * Rutas del CRM: exigen sesión + ser owner/admin en alguna org (F3-04).
 * Sin membresías → onboarding (es un dueño nuevo). Solo atleta → pantalla que
 * explica que esta app no es para él.
 */
export function AdminRoute() {
  const { status, memberships, activeOrgId } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const access = resolveAdminAccess(memberships);
  if (access.kind === 'onboarding') return <Navigate to="/onboarding" replace />;
  if (access.kind === 'none') return <Navigate to="/sin-acceso" replace />;
  // Con varias orgs administradas y ninguna elegida, el shell no sabría a cuál
  // pedirle los datos.
  if (!activeOrgId) return <Navigate to="/select-org" replace />;
  return <Outlet />;
}

/** Solo exige sesión: onboarding, selector de org y la pantalla de bloqueo. */
export function AuthedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Rutas de auth: con sesión va al dashboard (el guard de rol decide después). */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return <Outlet />;
}
