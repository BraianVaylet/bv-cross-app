import { Button, Input } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/endpoints';
import { AuthShell } from '../components/AuthShell';

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Siempre "enviado": la API no revela si el email existe (sin oráculo).
    await api.auth.forgotPassword(email).catch(() => undefined);
    setSent(true);
  };

  return (
    <AuthShell
      title="Recuperá tu contraseña"
      subtitle={sent ? undefined : 'Te mandamos un enlace para crear una nueva.'}
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-ink-muted">
          Si <span className="font-medium text-ink">{email}</span> tiene cuenta, va a recibir un
          enlace para restablecer la contraseña. Revisá spam si no llega.
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
          />
          <Button type="submit" full size="lg" loading={loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
