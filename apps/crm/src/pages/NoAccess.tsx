import { Button, Card } from '@bv/ui';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

/**
 * El atleta que abre el CRM por error (F3-04). No se le crea un gimnasio ni se
 * le muestra un 403 pelado: se le explica y se lo manda a las apps que sí son
 * para él.
 */
export function NoAccess() {
  usePageTitle('Esta app es para administradores');
  const { logout } = useAuth();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <Card className="space-y-4 text-center">
        <h1 className="font-display text-xl font-semibold text-ink">
          Esta app es para administradores
        </h1>
        <p className="text-sm text-ink-muted">
          Tu cuenta no administra ningún gimnasio. Si sos atleta, entrá por las apps de cargas o de
          agenda; si esperabas administrar, pedile al dueño que te dé permisos.
        </p>
        <Button variant="secondary" full onClick={() => void logout()}>
          Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}
