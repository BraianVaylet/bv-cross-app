import { Button, ErrorBanner, FullScreenSpinner } from '@bv/ui';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { AuthShell } from '../components/AuthShell';
import { ButtonLink } from '../components/ButtonLink';

type State = 'verifying' | 'ok' | 'error';

/** Destino del enlace del mail: lee ?token, verifica y ofrece ir a login. */
export function Verify() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('El enlace no tiene token. Abrí el enlace completo del mail.');
      return;
    }
    api.auth
      .verifyEmail(token)
      .then(() => { setState('ok'); })
      .catch((err: unknown) => {
        setState('error');
        setError(errorMessage(err));
      });
  }, [token]);

  if (state === 'verifying') return <FullScreenSpinner />;

  if (state === 'ok') {
    return (
      <AuthShell title="¡Email verificado!" subtitle="Tu cuenta quedó activa.">
        <ButtonLink to="/login" full size="lg">
          Iniciar sesión
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="No pudimos verificar"
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      <div className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-sm text-ink-muted">
          El enlace puede haber vencido. Pedí uno nuevo con tu email:
        </p>
        <input
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-accent"
        />
        {resent ? (
          <p className="text-sm font-medium text-ok">Listo, revisá tu casilla.</p>
        ) : (
          <Button
            full
            disabled={email.trim() === ''}
            onClick={() => {
              void api.auth.resendVerification(email).catch(() => undefined);
              setResent(true);
            }}
          >
            Reenviar verificación
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
