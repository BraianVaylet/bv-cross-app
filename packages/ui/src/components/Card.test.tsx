import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState, ErrorBanner, Skeleton } from './Card.js';

describe('states', () => {
  it('EmptyState renders title, text and action', () => {
    render(<EmptyState title="Sin ejercicios" text="Cargá el primero" action={<button>Crear</button>} />);
    expect(screen.getByRole('heading', { name: 'Sin ejercicios' })).toBeTruthy();
    expect(screen.getByText('Cargá el primero')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy();
  });

  it('Skeleton is aria-hidden (screen readers skip placeholders)', () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('ErrorBanner announces as alert', () => {
    render(<ErrorBanner>Falló la carga</ErrorBanner>);
    expect(screen.getByRole('alert').textContent).toContain('Falló la carga');
  });
});
