import { Button, Card, CheckIcon, Input, LogoutIcon, useToast } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { BackLink } from '../components/BackLink';

const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev';

/** Cuenta (F2-06): perfil, contraseña, organización, sesión. */
export function Account() {
  const { user, memberships, activeOrgId, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId);

  // ── Nombre ──
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setSavingName(true);
    try {
      const { user: updated } = await api.me.update(name.trim());
      updateUser(updated);
      toast.show('Nombre actualizado.');
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  // ── Contraseña ──
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [currentError, setCurrentError] = useState<string | undefined>();
  const [nextError, setNextError] = useState<string | undefined>();
  const [savingPass, setSavingPass] = useState(false);

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setCurrentError(undefined);
    setNextError(undefined);
    setSavingPass(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.show('Contraseña actualizada.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setCurrentError('La contraseña actual no es correcta.');
      } else if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setNextError(err.message);
      } else {
        setNextError(errorMessage(err));
      }
    } finally {
      setSavingPass(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-5">
      <BackLink to="/">Panel</BackLink>
      <h1 className="font-display text-2xl font-semibold text-ink">Tu cuenta</h1>

      {user && (
        <p className="text-sm text-ink-muted">
          Sesión iniciada como <span className="font-medium text-ink">{user.email}</span>
        </p>
      )}

      <Card>
        <form onSubmit={(e) => void saveName(e)} className="space-y-3">
          <Input
            label="Nombre"
            required
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            error={nameError}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={savingName}
            disabled={name.trim() === '' || name.trim() === user?.name}
          >
            Guardar nombre
          </Button>
        </form>
      </Card>

      <Card>
        <form onSubmit={(e) => void savePassword(e)} className="space-y-3">
          <h2 className="font-display text-base font-semibold text-ink">Cambiar contraseña</h2>
          <Input
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
            }}
            error={currentError}
          />
          <Input
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="Mínimo 8 caracteres; evitá contraseñas comunes."
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
            }}
            error={nextError}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={savingPass}
            disabled={current === '' || next === ''}
          >
            Actualizar contraseña
          </Button>
          <p className="text-xs text-ink-dim">
            Al cambiarla se cierran las demás sesiones; esta se mantiene.
          </p>
        </form>
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Gimnasio</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {activeOrg ? (
              <>
                Estás en <span className="font-medium text-ink">{activeOrg.orgName}</span>.
              </>
            ) : (
              'No tenés un gimnasio activo.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {memberships.filter((m) => m.status === 'active').length > 1 && (
            <Link
              to="/select-org"
              className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-raised"
            >
              Cambiar de gimnasio
            </Link>
          )}
          <Link
            to="/onboarding"
            className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-raised"
          >
            Crear otro gimnasio
          </Link>
        </div>
      </Card>

      <Button variant="danger" full onClick={() => void onLogout()}>
        <LogoutIcon className="h-4 w-4" /> Cerrar sesión
      </Button>

      <p className="flex items-center justify-center gap-1 pt-2 text-center text-xs text-ink-dim">
        <CheckIcon className="h-3 w-3" /> BV CRM · versión {BUILD_ID}
      </p>
    </div>
  );
}
