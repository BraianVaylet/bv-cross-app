import { Button, ErrorBanner, Input } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true);
      } else {
        setError(errorMessage(err));
      }
      setLoading(false);
    }
  };

  const resend = async () => {
    await api.auth.resendVerification(email).catch(() => undefined);
    setResent(true); // misma respuesta exista o no la cuenta (sin oráculo)
  };

  return (
    <AuthShell
      title="Iniciá sesión"
      subtitle="Tus RMs y cargas, listos para entrenar."
      footer={
        <>
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Creá una
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {needsVerification && (
          <div className="space-y-2 rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink-muted">
            <p>Tu email todavía no está verificado. Revisá tu casilla.</p>
            {resent ? (
              <p className="font-medium text-ok">Listo, te reenviamos el mail.</p>
            ) : (
              <button
                type="button"
                onClick={() => void resend()}
                className="font-medium text-accent hover:underline"
              >
                Reenviar verificación
              </button>
            )}
          </div>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
        />
        <Button type="submit" full size="lg" loading={loading}>
          Entrar
        </Button>
        <p className="text-center">
          <Link to="/forgot" className="text-sm font-medium text-ink-muted hover:text-ink">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
