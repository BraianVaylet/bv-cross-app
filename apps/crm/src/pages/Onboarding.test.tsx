import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Onboarding del dueño (F3-04): de cuenta nueva a gimnasio operativo. Los
 * pasos 2 y 3 se saltean; el código del final es lo único que no se puede
 * perder.
 */

const createOrgMock = vi.fn();
const createTemplateMock = vi.fn();
const createPackMock = vi.fn();
const refreshMembershipsMock = vi.fn();
const selectOrgMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    orgs: { create: (body: unknown) => createOrgMock(body) as unknown },
    templates: { create: (body: unknown) => createTemplateMock(body) as unknown },
    packs: { create: (body: unknown) => createPackMock(body) as unknown },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    refreshMemberships: refreshMembershipsMock,
    selectOrg: selectOrgMock,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => navigateMock };
});

const { Onboarding } = await import('./Onboarding');

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Onboarding />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function crearGimnasio(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Nombre del gimnasio'), {
    target: { value: 'Bahía Cross' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear gimnasio' }));
  await waitFor(() => {
    expect(createOrgMock).toHaveBeenCalled();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Forma real de la respuesta: `POST /orgs` devuelve SOLO la org (verificado
  // contra la API; el mock anterior inventaba un `membership` que no existe).
  createOrgMock.mockResolvedValue({
    org: { id: 'o1', name: 'Bahía Cross', slug: 'bahia-cross', joinCode: 'bahia-cross-x9k2' },
  });
  createTemplateMock.mockResolvedValue({ template: { id: 't1' } });
  createPackMock.mockResolvedValue({ pack: { id: 'p1' } });
  refreshMembershipsMock.mockResolvedValue([]);
});

describe('Onboarding (F3-04)', () => {
  it('crea el gimnasio con nombre y timezone, y lo deja activo', async () => {
    renderPage();
    expect(screen.getByText('Paso 1 de 4')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Zona horaria'), {
      target: { value: 'America/Argentina/Cordoba' },
    });
    await crearGimnasio();

    expect(createOrgMock).toHaveBeenCalledWith({
      name: 'Bahía Cross',
      timezone: 'America/Argentina/Cordoba',
    });
    // Sin esto, los pasos 2 y 3 pegarían contra ninguna org.
    expect(refreshMembershipsMock).toHaveBeenCalled();
    expect(selectOrgMock).toHaveBeenCalledWith('o1');
    expect(await screen.findByText('Tu primera clase')).toBeTruthy();
  });

  it('flujo completo: clase y pack se crean con lo cargado', async () => {
    renderPage();
    await crearGimnasio();

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear clase' }));
    await waitFor(() => {
      expect(createTemplateMock).toHaveBeenCalledWith({
        weekday: 1,
        startTime: '19:30',
        durationMin: 60,
        discipline: 'crossfit',
        capacity: 12,
      });
    });

    expect(await screen.findByText('Tu primer pack')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Crear pack' }));
    await waitFor(() => {
      expect(createPackMock).toHaveBeenCalledWith({
        name: '8 clases',
        classCount: 8,
        durationDays: 30,
        price: 25000,
        paymentMethod: 'cash',
      });
    });
    expect(await screen.findByText('¡Listo!')).toBeTruthy();
  });

  it('los pasos 2 y 3 se pueden saltear sin llamar a la API', async () => {
    renderPage();
    await crearGimnasio();

    fireEvent.click(await screen.findByRole('button', { name: 'Después' }));
    expect(await screen.findByText('Tu primer pack')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Después' }));

    expect(await screen.findByText('¡Listo!')).toBeTruthy();
    expect(createTemplateMock).not.toHaveBeenCalled();
    expect(createPackMock).not.toHaveBeenCalled();
  });

  it('al final muestra el código y copia el mensaje de invitación', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPage();
    await crearGimnasio();
    fireEvent.click(await screen.findByRole('button', { name: 'Después' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Después' }));

    expect(await screen.findByText('bahia-cross-x9k2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje de invitación' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const mensaje = writeText.mock.calls[0]?.[0] as string;
    expect(mensaje).toContain('bahia-cross-x9k2');
    expect(mensaje).toContain('Bahía Cross');

    fireEvent.click(screen.getByRole('button', { name: 'Ir al panel' }));
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('un error del servidor se muestra y no avanza de paso', async () => {
    createOrgMock.mockRejectedValue(new Error('El nombre ya está en uso.'));
    renderPage();
    await crearGimnasio();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 4')).toBeTruthy();
  });
});
