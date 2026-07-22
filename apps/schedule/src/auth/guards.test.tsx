import type { MembershipSummaryDto } from '@bv/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthStatus } from './AuthContext';

/**
 * Guards de ruta (F4-03 caso 2, portado de F2-03).
 *
 * El estado de auth se inyecta con un mock: acá se prueba a dónde manda cada
 * combinación (sesión, membresías, org activa), no cómo se hidrata.
 */
interface AuthState {
  status: AuthStatus;
  memberships: MembershipSummaryDto[];
  activeOrgId: string | null;
}

const auth = vi.hoisted(() => ({ current: null as AuthState | null }));

const setAuth = (state: AuthState): void => {
  auth.current = state;
};

vi.mock('./AuthContext', () => ({ useAuth: () => auth.current }));

const { AuthedRoute, ProtectedRoute, PublicOnlyRoute } = await import('./guards');

const ORG_A = '6a5fcf10ee11044b99d0dce9';
const ORG_B = '6a5fcf10ee11044b99d0dcea';

const membership = (orgId: string, status: 'active' | 'invited'): MembershipSummaryDto => ({
  id: orgId,
  orgId,
  orgName: `Box ${orgId.slice(-2)}`,
  orgSlug: `box-${orgId.slice(-2)}`,
  role: 'athlete',
  status,
  timezone: 'America/Argentina/Buenos_Aires',
  sessionGenerationDays: 14,
  cancellationWindowHours: 2,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>pantalla de login</p>} />
        <Route path="/join" element={<p>pantalla de join</p>} />
        <Route path="/select-org" element={<p>elegir gimnasio</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<p>grilla</p>} />
        </Route>
        <Route element={<AuthedRoute />}>
          <Route path="/solo-sesion" element={<p>solo sesión</p>} />
        </Route>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/registro" element={<p>formulario público</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('guards de ruta (F4-03)', () => {
  beforeEach(() => {
    setAuth({ status: 'loading', memberships: [], activeOrgId: null });
  });

  it('mientras hidrata no decide nada: ni contenido ni redirección', () => {
    renderAt('/');
    expect(screen.queryByText('grilla')).toBeNull();
    expect(screen.queryByText('pantalla de login')).toBeNull();
  });

  it('anónimo en una ruta de negocio → login', () => {
    setAuth({ status: 'anon', memberships: [], activeOrgId: null });
    renderAt('/');
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });

  it('con sesión pero sin membresías activas → join', () => {
    setAuth({
      status: 'authed',
      memberships: [membership(ORG_A, 'invited')], // pre-carga: todavía no cuenta
      activeOrgId: null,
    });
    renderAt('/');
    expect(screen.getByText('pantalla de join')).toBeTruthy();
  });

  it('con varias membresías y ninguna activa elegida → select-org', () => {
    setAuth({
      status: 'authed',
      memberships: [membership(ORG_A, 'active'), membership(ORG_B, 'active')],
      activeOrgId: null,
    });
    renderAt('/');
    expect(screen.getByText('elegir gimnasio')).toBeTruthy();
  });

  it('con sesión y org activa entra a la grilla', () => {
    setAuth({
      status: 'authed',
      memberships: [membership(ORG_A, 'active')],
      activeOrgId: ORG_A,
    });
    renderAt('/');
    expect(screen.getByText('grilla')).toBeTruthy();
  });

  it('/join y /select-org solo piden sesión, no org activa', () => {
    setAuth({ status: 'authed', memberships: [], activeOrgId: null });
    renderAt('/solo-sesion');
    expect(screen.getByText('solo sesión')).toBeTruthy();

    setAuth({ status: 'anon', memberships: [], activeOrgId: null });
    renderAt('/solo-sesion');
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });

  it('las pantallas de auth expulsan a quien ya tiene sesión (SSO)', () => {
    setAuth({
      status: 'authed',
      memberships: [membership(ORG_A, 'active')],
      activeOrgId: ORG_A,
    });
    renderAt('/registro');
    expect(screen.getByText('grilla')).toBeTruthy();
  });
});
