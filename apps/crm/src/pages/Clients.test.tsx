import type { MemberDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Lista de clientes (F3-05): búsqueda, filtros, paginación y alta manual. */

const listMock = vi.fn();
const createMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    members: {
      list: (params: unknown) => listMock(params) as unknown,
      create: (body: unknown) => createMock(body) as unknown,
    },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => navigateMock };
});

const { ApiError } = await import('../api/client');
const { Clients } = await import('./Clients');

const member = (over: Partial<MemberDto> = {}): MemberDto => ({
  id: 'm1',
  role: 'athlete',
  status: 'active',
  profile: { displayName: 'Ana Fuerte' },
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Clients />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ items: [member()], nextCursor: null });
});

describe('Clients (F3-05)', () => {
  it('lista los clientes con su estado', async () => {
    listMock.mockResolvedValue({
      items: [member(), member({ id: 'm2', status: 'invited', profile: { displayName: 'Bruno' } })],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findAllByText('Ana Fuerte')).not.toHaveLength(0);
    expect(screen.getAllByText('Invitado').length).toBeGreaterThan(0);
  });

  it('la búsqueda espera a que dejes de escribir (un request, no uno por tecla)', async () => {
    renderPage();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });

    const input = screen.getByLabelText('Buscar');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'an' } });
    fireEvent.change(input, { target: { value: 'ana' } });
    expect(listMock).toHaveBeenCalledTimes(1); // todavía nada

    await waitFor(
      () => {
        expect(listMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 1500 },
    );
    expect(listMock).toHaveBeenLastCalledWith({ q: 'ana' });
  });

  it('el filtro de estado se manda al servidor', async () => {
    renderPage();
    await waitFor(() => {
      expect(listMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Invitados' }));
    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({ status: 'invited' });
    });
  });

  it('"Cargar más" agrega la página siguiente sin duplicar', async () => {
    listMock.mockResolvedValueOnce({ items: [member()], nextCursor: 'm1' });
    listMock.mockResolvedValueOnce({
      items: [member({ id: 'm2', profile: { displayName: 'Bruno' } })],
      nextCursor: null,
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    });
    expect(screen.getAllByText('Ana Fuerte').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bruno').length).toBeGreaterThan(0);
  });

  it('sin resultados de búsqueda lo dice sin sonar a error', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('Todavía no hay clientes')).toBeTruthy();
  });

  it('alta manual: crea y abre la ficha', async () => {
    createMock.mockResolvedValue({ member: member({ id: 'nuevo' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carla' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'carla@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar cliente' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        profile: { displayName: 'Carla' },
        invitedEmail: 'carla@test.com',
      });
    });
    expect(navigateMock).toHaveBeenCalledWith('/clients/nuevo');
  });

  it('ALREADY_MEMBER se explica en el formulario, no en un toast que se va', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'ALREADY_MEMBER', 'Ya es miembro.'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo cliente' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carla' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cargar cliente' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Ese email ya está en el gimnasio.')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
