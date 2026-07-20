import { buttonCx, cx, type ButtonSize, type ButtonVariant } from '@bv/ui';
import { Link, type LinkProps } from 'react-router-dom';

/** Botón que navega: mismo look que Button de @bv/ui, sobre react-router. */
export function ButtonLink({
  variant,
  size,
  full,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean }) {
  return (
    <Link className={cx(buttonCx({ variant, size, full }), className)} {...rest}>
      {children}
    </Link>
  );
}
