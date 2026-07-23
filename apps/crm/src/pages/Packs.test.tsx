import type { PackDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Catálogo de packs (F3-07): la matriz RN-14 se comunica, no se descubre. */

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const archiveMock = vi.fn();
const restoreMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    packs: {
      list: (includeArchived?: boolean) => listMock(includeArchived) as unknown,
      create: (body: unknown) => createMock(body) as unknown,
      update: (id: string, body: unknown) => updateMock(id, body) as unknown,
      archive: (id: string) => archiveMock(id) as unknown,
      restore: (id: string) => restoreMock(id) as unknown,
    },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    memberships: [
      {
        id: 'mm1',
        orgId: 'o1',
        orgName: 'Bahía Cross',
        orgSlug: 'bahia',
        role: 'owner',
        status: 'active',
        timezone: 'America/Argentina/Buenos_Aires',
        sessionGenerationDays: 14,
        cancellationWindowHours: 2,
      },
    ],
    activeOrgId: 'o1',
  }),
}));

const { Packs } = await import('./Packs');

const pack = (over: Partial<PackDto> = {}): PackDto => ({
  id: 'p1',
  name: '8 clases',
  classCount: 8,
  durationDays: 30,
  price: 25_000,
  currency: 'ARS',
  paymentMethod: 'cash',
  activeAssignments: 0,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <Packs />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ items: [pack()] });
});

describe('Packs (F3-07)', () => {
  it('muestra el pack con precio en formato argentino', async () => {
    renderPage();
    expect(await screen.findByText('8 clases')).toBeTruthy();
    expect(screen.getByText(/8 clases · 30 días/)).toBeTruthy();
    expect(screen.getByText('$25.000')).toBeTruthy();
    expect(screen.getByText('Efectivo')).toBeTruthy();
  });

  it('con clientes vigentes bloquea los campos de RN-14 y lo explica', async () => {
    listMock.mockResolvedValue({ items: [pack({ activeAssignments: 3 })] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByText(/3 clientes vigentes/)).toBeTruthy();
    expect(screen.getByText(/archivalo y creá uno nuevo/)).toBeTruthy();

    // Nombre y notas siguen editables; el resto no.
    expect(screen.getByLabelText('Nombre').hasAttribute('disabled')).toBe(false);
    expect(screen.getByLabelText('Notas internas').hasAttribute('disabled')).toBe(false);
    for (const campo of ['Clases', 'Días de vigencia', 'Precio', 'Medio de pago']) {
      expect(screen.getByLabelText(campo).hasAttribute('disabled')).toBe(true);
    }
  });

  it('con clientes vigentes solo manda nombre y notas al servidor', async () => {
    listMock.mockResolvedValue({ items: [pack({ activeAssignments: 2 })] });
    updateMock.mockResolvedValue({ pack: pack({ name: 'Pack 8 (verano)', activeAssignments: 2 }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pack 8 (verano)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('p1', {
        name: 'Pack 8 (verano)',
        internalNotes: null,
      });
    });
  });

  it('sin clientes vigentes se edita todo', async () => {
    updateMock.mockResolvedValue({ pack: pack({ price: 30_000 }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.queryByText(/clientes vigentes/)).toBeNull();
    expect(screen.getByLabelText('Precio').hasAttribute('disabled')).toBe(false);

    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('p1', {
        name: '8 clases',
        internalNotes: null,
        classCount: 8,
        durationDays: 30,
        price: 30000,
        paymentMethod: 'cash',
      });
    });
  });

  it('archivar explica que los clientes vigentes no se ven afectados', async () => {
    archiveMock.mockResolvedValue({
      pack: pack({ archivedAt: '2026-07-20T00:00:00.000Z' }),
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Archivar' }));
    expect(screen.getByText(/siguen con sus clases hasta que se les venzan/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Archivar' }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(archiveMock).toHaveBeenCalledWith('p1');
    });
    // Sale de Activos y el contador lo refleja.
    expect(await screen.findByRole('button', { name: /Archivados \(1\)/ })).toBeTruthy();
  });

  it('el tab de archivados es el historial de precios (RN-15)', async () => {
    listMock.mockResolvedValue({
      items: [
        pack({ id: 'viejo', name: '8 clases', price: 20_000, archivedAt: '2026-05-01T00:00:00.000Z' }),
        pack({ id: 'nuevo', name: '8 clases v2', price: 25_000, archivedAt: '2026-07-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Archivados \(2\)/ }));
    // El más reciente primero, con su período de vigencia y su precio.
    const nombres = screen.getAllByText(/^8 clases/).map((el) => el.textContent);
    expect(nombres[0]).toBe('8 clases v2');
    // Las fechas se leen en la tz del gimnasio: 01/06 00:00Z es 31/05 en AR.
    expect(screen.getByText(/Vigente del 31\/05 al 30\/06/)).toBeTruthy();
    expect(screen.getByText('$20.000')).toBeTruthy();
  });

  it('restaurar vuelve a ponerlo en el catálogo', async () => {
    listMock.mockResolvedValue({ items: [pack({ archivedAt: '2026-07-01T00:00:00.000Z' })] });
    restoreMock.mockResolvedValue({ pack: pack() });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Archivados \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => {
      expect(restoreMock).toHaveBeenCalledWith('p1');
    });
    expect(await screen.findByRole('button', { name: /Activos \(1\)/ })).toBeTruthy();
  });

  it('crear un pack manda todo el formulario', async () => {
    createMock.mockResolvedValue({ pack: pack({ id: 'p2', name: '12 clases' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo pack' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '12 clases' } });
    fireEvent.change(screen.getByLabelText('Clases'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '32000' } });
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'debit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear pack' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        name: '12 clases',
        classCount: 12,
        durationDays: 30,
        price: 32000,
        paymentMethod: 'debit',
      });
    });
  });

  it('sin packs invita a crear el primero', async () => {
    listMock.mockResolvedValue({ items: [] });
    renderPage();
    expect(await screen.findByText('Todavía no hay packs')).toBeTruthy();
  });
});
