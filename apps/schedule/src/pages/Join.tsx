import { Button, ErrorBanner, Input, useToast } from '@bv/ui';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { destinationFor, joinErrorView, normalizeCode, type JoinErrorView } from './joinLogic';

/**
 * Unión a una organización por código (F2-04, RN-01). Normaliza el código en
 * vivo y traduce cada error de la API a un mensaje accionable.
 */
export function Join() {
  const { user, refreshMemberships, selectOrg } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [error, setError] = useState<JoinErrorView | null>(null);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  // Lock síncrono: dos clicks en el mismo tick comparten el closure con
  // loading=false, así que el estado no alcanza para garantizar un solo POST.
  const submitting = useRef(false);

  const goAfterJoin = (orgId: string | null, orgName: string | null) => {
    // refreshMemberships ya corrió: el destino depende de cuántas activas quedaron.
    return refreshMemberships().then((memberships) => {
      if (orgId && destinationFor(memberships) === 'home') {
        selectOrg(orgId);
        if (orgName) toast.show(`¡Bienvenido a ${orgName}!`);
        void navigate('/', { replace: true });
      } else {
        void navigate('/select-org', { replace: true });
      }
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting.current) return; // un solo POST aunque lleguen dos clicks juntos
    submitting.current = true;
    setError(null);
    setResent(false);
    setLoading(true);
    try {
      const { membership } = await api.orgs.join(code);
      await goAfterJoin(membership.orgId, membership.orgName); // navega: no se resetea el lock
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_MEMBER') {
        // No es un error para el usuario: ya pertenece → a selección.
        toast.show('Ya sos parte de ese gimnasio.', 'info');
        await goAfterJoin(null, null);
        return;
      }
      const errorCode = err instanceof ApiError ? err.code : 'ERROR';
      setError(joinErrorView(errorCode, errorMessage(err)));
      submitting.current = false;
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!user) return;
    await api.auth.resendVerification(user.email).catch(() => undefined);
    setResent(true);
  };

  return (
    <AuthShell
      title="Unite a tu gimnasio"
      subtitle="Pedile el código a tu box y reservá en su grilla."
      footer={
        <Link to="/select-org" className="font-medium text-accent hover:underline">
          Volver a mis gimnasios
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && (
          <div className="space-y-2">
            <ErrorBanner>{error.message}</ErrorBanner>
            {error.canResend &&
              (resent ? (
                <p className="text-sm font-medium text-ok">Listo, te reenviamos el mail.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => void resend()}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Reenviar verificación
                </button>
              ))}
          </div>
        )}
        <Input
          label="Código del gimnasio"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="ej: bahia-cross-demo"
          hint="Letras, números y guiones."
          value={code}
          onChange={(e) => {
            setCode(normalizeCode(e.target.value));
          }}
        />
        <Button type="submit" full size="lg" loading={loading} disabled={code.length < 4}>
          Unirme
        </Button>
      </form>
    </AuthShell>
  );
}
