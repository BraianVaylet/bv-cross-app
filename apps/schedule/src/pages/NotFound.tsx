import { EmptyState } from '@bv/ui';
import { ButtonLink } from '../components/ButtonLink';

export function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        title="Página inexistente"
        text="El enlace puede estar roto o la página ya no existe."
        action={
          <ButtonLink to="/" variant="secondary">
            Ir al inicio
          </ButtonLink>
        }
      />
    </div>
  );
}
