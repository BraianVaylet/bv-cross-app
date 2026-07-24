import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard.js';

describe('StatCard (F3-10)', () => {
  it('muestra el valor ya formateado y su contexto', () => {
    render(<StatCard label="Ingresos del mes" value="$ 77.000" hint="julio 2026" />);
    expect(screen.getByText('$ 77.000')).toBeTruthy();
    expect(screen.getByText('julio 2026')).toBeTruthy();
  });

  it('sin delta no inventa un 0%', () => {
    render(<StatCard label="Nuevos" value="3" />);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('el signo del delta se anuncia, no solo se colorea', () => {
    render(<StatCard label="Ingresos" value="$ 1" delta={-12} />);
    expect(screen.getByLabelText('baja 12 por ciento')).toBeTruthy();
    expect(screen.getByText(/12%/)).toBeTruthy();
  });

  it('en cancelaciones subir es malo: el color se invierte', () => {
    const { container } = render(
      <StatCard label="Cancelaciones" value="9" delta={20} deltaMeaning="up-bad" />,
    );
    // Mismo delta positivo que en ingresos, pero acá va en tono de alerta.
    expect(container.querySelector('.text-warn')).toBeTruthy();
    expect(container.querySelector('.text-accent-strong')).toBeNull();
  });
});
