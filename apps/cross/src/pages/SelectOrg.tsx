import { ChevronRightIcon, EmptyState } from '@bv/ui';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Admin',
  coach: 'Coach',
  athlete: 'Atleta',
};

/** Selector de organización activa (F7): cards con nombre + rol. */
export function SelectOrg() {
  const { memberships, selectOrg } = useAuth();
  const navigate = useNavigate();
  const active = memberships.filter((m) => m.status === 'active');

  if (active.length === 0) return <Navigate to="/join" replace />;

  return (
    <AuthShell
      title="¿Con qué gimnasio entrás?"
      subtitle="Podés cambiar de gimnasio cuando quieras."
      footer={
        <Link to="/join" className="font-medium text-accent hover:underline">
          Unirme a otro gimnasio
        </Link>
      }
    >
      {active.length === 0 ? (
        <EmptyState title="Sin organizaciones" text="Unite a un gimnasio con su código." />
      ) : (
        <ul className="space-y-2.5">
          {active.map((m) => (
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
      )}
    </AuthShell>
  );
}
