import type { AssignmentDto, MemberDto, PackDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Ficha del cliente (F3-05): datos, packs, asignación y bajas. */

const getMock = vi.fn();
const assignmentsMock = vi.fn();
const updateMock = vi.fn();
const assignMock = vi.fn();
const cancelMock = vi.fn();
const packsMock = vi.fn();
const orgMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    members: {
      get: (id: string) => getMock(id) as unknown,
      assignments: (id: string) => assignmentsMock(id) as unknown,
      update: (id: string, body: unknown) => updateMock(id, body) as unknown,
      assign: (id: string, body: unknown) => assignMock(id, body) as unknown,
    },
    assignments: { cancel: (id: string, reason: string) => cancelMock(id, reason) as unknown },
    packs: { list: () => packsMock() as unknown },
    orgs: { current: () => orgMock() as unknown },
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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => vi.fn() };
});

const { ClientDetail } = await import('./ClientDetail');

const member = (over: Partial<MemberDto> = {}): MemberDto => ({
  id: 'm1',
  role: 'athlete',
  status: 'active',
  profile: { displayName: 'Ana Fuerte', phone: '291-555' },
  adminNotes: 'Lesión de hombro',
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const pack = (over: Partial<PackDto> = {}): PackDto => ({
  id: 'p1',
  name: '8 clases',
  classCount: 8,
  durationDays: 30,
  price: 25_000,
  currency: 'ARS',
  paymentMethod: 'cash',
  activeAssignments: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const assignment = (over: Partial<AssignmentDto> = {}): AssignmentDto => ({
  id: 'a1',
  packId: 'p1',
  userId: 'u1',
  snapshot: {
    name: '8 clases',
    classCount: 8,
    durationDays: 30,
    price: 25_000,
    currency: 'ARS',
    paymentMethod: 'cash',
  },
  startsAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-01T23:59:59.999Z',
  classesUsed: 3,
  remaining: 5,
  status: 'active',
  payment: { amount: 25_000, method: 'cash', paidAt: '2026-07-01T00:00:00.000Z' },
  createdAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/clients/m1']}>
      <ToastProvider>
        <Routes>
          <Route path="/clients/:id" element={<ClientDetail />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({ member: member() });
  assignmentsMock.mockResolvedValue({ items: [assignment()] });
  packsMock.mockResolvedValue({ items: [pack(), pack({ id: 'p2', name: '12 clases', classCount: 12, price: 32_000 })] });
  orgMock.mockResolvedValue({ org: { id: 'o1', name: 'Bahía Cross', slug: 'bahia', joinCode: 'bahia-x9k2', timezone: 'America/Argentina/Buenos_Aires', settings: {} } });
});

describe('ClientDetail (F3-05)', () => {
  it('muestra la ficha con sus packs y el progreso', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Ana Fuerte' })).toBeTruthy();
    expect(screen.getByText(/5 de 8 clases/)).toBeTruthy();
    const barra = screen.getByRole('progressbar', { name: /Clases usadas/ });
    expect(barra.getAttribute('aria-valuenow')).toBe('3');
  });

  it('las notas internas avisan que hay cambios sin guardar y se guardan a mano', async () => {
    updateMock.mockResolvedValue({ member: member({ adminNotes: 'Hombro recuperado' }) });
    renderPage();

    const notas = await screen.findByLabelText('Notas internas');
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(notas, { target: { value: 'Hombro recuperado' } });
    expect(screen.getByText('Hay cambios sin guardar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('m1', {
        profile: { displayName: 'Ana Fuerte', phone: '291-555' },
        adminNotes: 'Hombro recuperado',
      });
    });
  });

  it('asignar pack: precio prellenado, editable, y resumen antes de confirmar', async () => {
    assignMock.mockResolvedValue({ assignment: assignment({ id: 'a2' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Asignar pack' }));
    const monto = await screen.findByLabelText('Monto cobrado');
    expect((monto as HTMLInputElement).value).toBe('25000'); // del precio de lista

    // Cambiar de pack recalcula el monto.
    fireEvent.change(screen.getByLabelText('Pack'), { target: { value: 'p2' } });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Monto cobrado').value).toBe('32000');
    });

    // Descuento a mano: el resumen lo refleja.
    fireEvent.change(screen.getByLabelText('Monto cobrado'), { target: { value: '28000' } });
    expect(screen.getByText(/12 clases · vence el .* · \$28\.000 efectivo/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith('m1', {
        packId: 'p2',
        payment: { amount: 28000, method: 'cash' },
      });
    });
  });

  it('sin packs en el catálogo, el modal dice qué hacer en vez de un select vacío', async () => {
    packsMock.mockResolvedValue({ items: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar pack' }));
    expect(await screen.findByText(/No hay packs en el catálogo/)).toBeTruthy();
  });

  it('anular una asignación exige motivo', async () => {
    cancelMock.mockResolvedValue({
      assignment: assignment({ status: 'cancelled', cancelledReason: 'Se mudó' }),
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Anular' }));
    // Ya abierto el diálogo hay dos "Anular": el de la card y el de confirmar.
    const confirmar = () => screen.getAllByRole('button', { name: 'Anular' }).at(-1) as HTMLElement;
    expect(confirmar().hasAttribute('disabled')).toBe(true); // sin motivo no se puede

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Se mudó' } });
    fireEvent.click(confirmar());
    await waitFor(() => {
      expect(cancelMock).toHaveBeenCalledWith('a1', 'Se mudó');
    });
    expect(await screen.findByText('Anulado')).toBeTruthy();
  });

  it('deshabilitar explica el efecto antes de confirmar (RN-03)', async () => {
    updateMock.mockResolvedValue({ member: member({ status: 'disabled' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Deshabilitar' }));
    expect(screen.getByText(/Su historial y sus packs quedan intactos/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Deshabilitar' })[1] as HTMLElement);
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('m1', { status: 'disabled' });
    });
    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeTruthy();
  });

  it('copiar invitación arma el mensaje con el código del gimnasio', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar invitación' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const mensaje = writeText.mock.calls[0]?.[0] as string;
    expect(mensaje).toContain('bahia-x9k2');
    expect(mensaje).toContain('Bahía Cross');
  });
});
