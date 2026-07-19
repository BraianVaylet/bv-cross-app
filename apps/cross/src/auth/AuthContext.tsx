import type { MembershipSummaryDto, UserDto } from '@bv/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { request, SESSION_EXPIRED_EVENT, setAccessToken, setActiveOrgId } from '../api/client';
import { api } from '../api/endpoints';
import { ORG_STORAGE_KEY, resolveActiveOrg } from './orgSelection';

export type AuthStatus = 'loading' | 'anon' | 'authed';

interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  memberships: MembershipSummaryDto[];
  activeOrgId: string | null;
  /** null = necesita selección manual (/select-org) o join (/join). */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectOrg: (orgId: string) => void;
  refreshMemberships: () => Promise<MembershipSummaryDto[]>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

function readStoredOrg(): string | null {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeOrg(orgId: string | null): void {
  try {
    if (orgId) localStorage.setItem(ORG_STORAGE_KEY, orgId);
    else localStorage.removeItem(ORG_STORAGE_KEY);
  } catch {
    /* storage no disponible */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserDto | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummaryDto[]>([]);
  const [activeOrgId, setActive] = useState<string | null>(null);

  const applyOrgResolution = useCallback((list: MembershipSummaryDto[]) => {
    const resolution = resolveActiveOrg(list, readStoredOrg());
    const orgId =
      resolution.kind === 'auto' || resolution.kind === 'restored' ? resolution.orgId : null;
    setActive(orgId);
    setActiveOrgId(orgId);
    storeOrg(orgId);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setActiveOrgId(null);
    setUser(null);
    setMemberships([]);
    setActive(null);
    setStatus('anon');
  }, []);

  // Al montar: POST /auth/refresh (la cookie viaja sola) → hidrata sin login.
  useEffect(() => {
    const run = { cancelled: false }; // propiedad mutable: StrictMode monta dos veces
    void (async () => {
      try {
        const { accessToken } = await request<{ accessToken: string }>('/api/v1/auth/refresh', {
          method: 'POST',
        });
        setAccessToken(accessToken);
        const [{ user: me }, { memberships: mine }] = await Promise.all([
          api.me.get(),
          api.me.memberships(),
        ]);
        if (run.cancelled) return;
        setUser(me);
        setMemberships(mine);
        applyOrgResolution(mine);
        setStatus('authed');
      } catch {
        if (!run.cancelled) clearSession();
      }
    })();

    const onExpired = () => { clearSession(); };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      run.cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [applyOrgResolution, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.auth.login(email, password);
      setAccessToken(res.accessToken);
      setUser(res.user);
      setMemberships(res.memberships);
      applyOrgResolution(res.memberships);
      setStatus('authed');
    },
    [applyOrgResolution],
  );

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined); // revoca la familia de refresh
    storeOrg(null);
    clearSession();
  }, [clearSession]);

  const selectOrg = useCallback((orgId: string) => {
    setActive(orgId);
    setActiveOrgId(orgId);
    storeOrg(orgId);
  }, []);

  const refreshMemberships = useCallback(async () => {
    const { memberships: mine } = await api.me.memberships();
    setMemberships(mine);
    applyOrgResolution(mine);
    return mine;
  }, [applyOrgResolution]);

  const value = useMemo(
    () => ({ status, user, memberships, activeOrgId, login, logout, selectOrg, refreshMemberships }),
    [status, user, memberships, activeOrgId, login, logout, selectOrg, refreshMemberships],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
