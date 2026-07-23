import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable.js';

interface Row {
  id: string;
  nombre: string;
  clases: number;
}

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'nombre', header: 'Nombre', cell: (r) => r.nombre, sortValue: (r) => r.nombre, primary: true },
  { key: 'clases', header: 'Clases', cell: (r) => String(r.clases), sortValue: (r) => r.clases },
  { key: 'acciones', header: 'Acciones', cell: () => <span>·</span> },
];

const ROWS: Row[] = [
  { id: '1', nombre: 'Carla', clases: 3 },
  { id: '2', nombre: 'Ana', clases: 8 },
  { id: '3', nombre: 'Bruno', clases: 1 },
];

const setup = (over: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
  render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} {...over} />);

/** Nombres tal como los ve el usuario en la tabla de escritorio. */
function nombresDeTabla(): string[] {
  const tabla = screen.getByRole('table');
  return within(tabla)
    .getAllByRole('row')
    .slice(1) // saltea el encabezado
    .map((tr) => tr.firstElementChild?.textContent ?? '');
}

describe('DataTable (F3-05)', () => {
  it('muestra la tabla en escritorio y las cards en mobile, con los mismos datos', () => {
    const { container } = setup();
    // Las dos variantes conviven; el CSS decide cuál se ve (jsdom no aplica media queries).
    expect(screen.getByRole('table').closest('div')?.className).toContain('md:block');
    const cards = container.querySelector('ul');
    expect(cards?.className).toContain('md:hidden');
    expect(within(cards as HTMLElement).getAllByRole('button')).toHaveLength(3);
  });

  it('ordena la página cargada, alternando asc y desc', () => {
    setup();
    expect(nombresDeTabla()).toEqual(['Carla', 'Ana', 'Bruno']); // sin tocar nada, el orden del server

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(nombresDeTabla()).toEqual(['Ana', 'Bruno', 'Carla']);

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(nombresDeTabla()).toEqual(['Carla', 'Bruno', 'Ana']);
  });

  it('ordena números como números, no como texto', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Clases' }));
    const tabla = screen.getByRole('table');
    const clases = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => tr.children[1]?.textContent);
    expect(clases).toEqual(['1', '3', '8']);
  });

  it('una columna sin `sortValue` no ofrece ordenar', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Ordenar por Acciones' })).toBeNull();
  });

  it('"Cargar más" solo aparece si hay más y avisa una vez por click', () => {
    const onLoadMore = vi.fn();
    const { rerender } = setup({ hasMore: false, onLoadMore });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();

    rerender(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} hasMore onLoadMore={onLoadMore} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('sin filas muestra el vacío que le pasan, no una tabla en blanco', () => {
    setup({ rows: [], empty: <p>No hay clientes todavía</p> });
    expect(screen.getByText('No hay clientes todavía')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('la fila lleva al detalle en las dos variantes', () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });

    fireEvent.click(within(screen.getByRole('table')).getAllByRole('row')[1] as HTMLElement);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);

    const cards = screen.getByRole('list');
    fireEvent.click(within(cards).getAllByRole('button')[1] as HTMLElement);
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);
  });
});
