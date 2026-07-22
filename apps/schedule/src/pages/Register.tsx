import { Button, ErrorBanner, Input } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { AuthShell } from '../components/AuthShell';

export function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    setLoading(true);
    try {
      await api.auth.register({ name, email, password });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setPasswordError(err.message);
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setError('Ese email ya tiene cuenta. Probá iniciar sesión.');
      } else {
        setError(errorMessage(err));
      }
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Revisá tu email"
        subtitle={`Te mandamos un enlace de verificación a ${email}.`}
        footer={
          <>
            ¿Ya verificaste?{' '}
            <Link to="/login" className="font-medium text-accent hover:underline">
              Iniciá sesión
            </Link>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Abrí el enlace del mail para activar tu cuenta. Si no llega en unos minutos, revisá spam.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Creá tu cuenta"
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Iniciá sesión
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Input
          label="Nombre"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => { setName(e.target.value); }}
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          hint="Mínimo 8 caracteres; evitá contraseñas comunes."
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
          error={passwordError ?? undefined}
        />
        <Button type="submit" full size="lg" loading={loading}>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}
