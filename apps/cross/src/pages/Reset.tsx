import { Button, ErrorBanner, Input } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { AuthShell } from '../components/AuthShell';
import { ButtonLink } from '../components/ButtonLink';

export function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setPasswordError(err.message);
      } else {
        setError(errorMessage(err));
      }
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Contraseña actualizada" subtitle="Ya podés entrar con la nueva.">
        <ButtonLink to="/login" full size="lg">
          Iniciar sesión
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {!token && (
          <ErrorBanner>El enlace no tiene token. Abrí el enlace completo del mail.</ErrorBanner>
        )}
        <Input
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="Mínimo 8 caracteres; evitá contraseñas comunes."
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
          error={passwordError ?? undefined}
        />
        <Button type="submit" full size="lg" loading={loading} disabled={!token}>
          Guardar contraseña
        </Button>
      </form>
    </AuthShell>
  );
}
