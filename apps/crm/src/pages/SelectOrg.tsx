import { ChevronRightIcon } from '@bv/ui';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { resolveAdminAccess } from '../auth/adminAccess';
import { AuthShell } from '../components/AuthShell';
import { usePageTitle } from '../lib/usePageTitle';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Admin',
};

/**
 * Selector de gimnasio del CRM (F7 del Funcional). Solo ofrece donde el
 * usuario es owner o admin: entrar a administrar un box donde solo entrena
 * no tendría sentido.
 */
export function SelectOrg() {
  usePageTitle('Elegí tu gimnasio');
  const { memberships, selectOrg } = useAuth();
  const navigate = useNavigate();
  const access = resolveAdminAccess(memberships);

  if (access.kind === 'onboarding') return <Navigate to="/onboarding" replace />;
  if (access.kind === 'none') return <Navigate to="/sin-acceso" replace />;

  return (
    <AuthShell
      title="¿Qué gimnasio administrás?"
      subtitle="Podés cambiar desde el panel cuando quieras."
      footer={
        <Link to="/onboarding" className="font-medium text-accent hover:underline">
          Crear otro gimnasio
        </Link>
      }
    >
      <ul className="space-y-2.5">
        {access.memberships.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => {
                selectOrg(m.orgId);
                navigate('/', { replace: true });
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/40 active:bg-raised"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-medium text-ink">{m.orgName}</p>
                <p className="mt-0.5 text-xs text-ink-dim">{ROLE_LABEL[m.role] ?? m.role}</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-dim" />
            </button>
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
