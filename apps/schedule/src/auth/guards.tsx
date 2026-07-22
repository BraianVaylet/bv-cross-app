import { FullScreenSpinner } from '@bv/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Rutas de negocio: exigen sesión + org activa.
 * authed sin membresías → /join · con >1 y ninguna activa → /select-org.
 */
export function ProtectedRoute() {
  const { status, memberships, activeOrgId } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  const activeMemberships = memberships.filter((m) => m.status === 'active');
  if (activeMemberships.length === 0) return <Navigate to="/join" replace />;
  if (!activeOrgId) return <Navigate to="/select-org" replace />;
  return <Outlet />;
}

/** Rutas que solo exigen sesión (join / select-org). */
export function AuthedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Rutas de auth: con sesión va directo a Home (el guard de org decide después). */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authed') return <Navigate to="/" replace />;
  return <Outlet />;
}
