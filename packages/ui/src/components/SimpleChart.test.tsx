import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SimpleChart, type ChartPoint } from './SimpleChart.js';

/**
 * Los bordes que rompen un gráfico casero: un solo punto, todos los valores
 * iguales (división por cero) y lista vacía. El assert que importa es que el
 * atributo `d` del path nunca tenga NaN.
 */
const pts = (values: number[]): ChartPoint[] =>
  values.map((value, i) => ({ value, label: `0${String(i + 1)}/01` }));

const pathD = (container: HTMLElement): string | null =>
  container.querySelector('path')?.getAttribute('d') ?? null;

describe('SimpleChart (F3-09)', () => {
  it('dibuja una serie normal sin NaN', () => {
    const { container } = render(<SimpleChart points={pts([60, 70, 65, 72.5])} unit="kg" />);
    const d = pathD(container);
    expect(d).toBeTruthy();
    expect(d).not.toContain('NaN');
    expect(container.querySelectorAll('circle')).toHaveLength(4);
  });

  it('con un solo punto no dibuja línea, pero sí el punto', () => {
    const { container } = render(<SimpleChart points={pts([80])} unit="kg" />);
    expect(pathD(container)).toBeNull(); // una línea de un punto no es una línea
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('todos los valores iguales: línea plana, sin división por cero', () => {
    const { container } = render(<SimpleChart points={pts([70, 70, 70])} unit="kg" />);
    const d = pathD(container);
    expect(d).not.toContain('NaN');
    // Las tres Y son la misma: la línea es horizontal.
    const ys = [...(d ?? '').matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => m[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it('50 puntos siguen dando un path válido', () => {
    const { container } = render(
      <SimpleChart points={pts(Array.from({ length: 50 }, (_, i) => 50 + (i % 17)))} />,
    );
    expect(pathD(container)).not.toContain('NaN');
    expect(container.querySelectorAll('circle')).toHaveLength(50);
  });

  it('sin datos dice que no hay, en vez de un SVG vacío', () => {
    render(<SimpleChart points={[]} />);
    expect(screen.getByText('Sin datos todavía')).toBeTruthy();
  });

  it('el punto destacado y el de dolor se distinguen', () => {
    const { container } = render(
      <SimpleChart
        points={[
          { value: 60, label: '01/01' },
          { value: 70, label: '01/02', highlight: true, warn: true, note: 'molestia' },
        ]}
        unit="kg"
      />,
    );
    // El destacado va relleno con el acento; el otro no.
    expect(container.querySelectorAll('circle.fill-accent')).toHaveLength(1);
    expect(screen.getByText('⚠')).toBeTruthy();
    // El comentario viaja en el tooltip nativo.
    expect(container.innerHTML).toContain('molestia');
  });

  it('tiene nombre accesible con el rango', () => {
    render(<SimpleChart points={pts([60, 90])} unit="kg" />);
    expect(screen.getByRole('img', { name: /de 60 a 90 kg/ })).toBeTruthy();
  });
});
