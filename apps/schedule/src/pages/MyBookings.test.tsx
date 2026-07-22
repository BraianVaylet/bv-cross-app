import type { BookingWithSessionDto, CreditsDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mis reservas (F4-05). Lo que se prueba: que la ventana de cancelación se
 * COMUNIQUE antes del error, que la advertencia del pack vencido salga solo
 * cuando corresponde, y que el 409 del servidor (carrera de relojes) no rompa
 * la pantalla.
 */

const bookingsMock = vi.fn();
const creditsMock = vi.fn<() => Promise<CreditsDto>>();
const cancelMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    me: {
      bookings: (params: unknown) => bookingsMock(params) as unknown,
      credits: () => creditsMock(),
    },
    bookings: { cancel: (id: string) => cancelMock(id) as unknown },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    memberships: [
      {
        id: 'm1',
        orgId: 'o1',
        orgName: 'Bahía Cross',
        orgSlug: 'bahia',
        role: 'athlete',
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
  return { ...actual, useNavigate: () => navigateMock };
});

const { ApiError } = await import('../api/client');
const { MyBookings } = await import('./MyBookings');

const inHours = (h: number): string => new Date(Date.now() + h * 3_600_000).toISOString();

const booking = (over: Partial<BookingWithSessionDto> = {}): BookingWithSessionDto => ({
  id: 'b1',
  sessionId: 's1',
  userId: 'u1',
  packAssignmentId: 'p1',
  status: 'booked',
  bookedAt: '2026-07-20T12:00:00.000Z',
  session: {
    id: 's1',
    startsAt: inHours(24),
    endsAt: inHours(25),
    discipline: 'crossfit',
    capacity: 12,
    bookedCount: 5,
    status: 'scheduled',
  },
  ...over,
});

const credits = (packStatus: CreditsDto['packs'][number]['status'] = 'active'): CreditsDto => ({
  packs: [
    {
      id: 'p1',
      name: '8 clases',
      remaining: 3,
      total: 8,
      status: packStatus,
      startsAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T23:59:59.999Z',
    },
  ],
  totalRemaining: 3,
  nextExpiration: '2026-08-01T23:59:59.999Z',
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <MyBookings />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingsMock.mockResolvedValue({ items: [booking()], nextCursor: null });
  creditsMock.mockResolvedValue(credits());
  cancelMock.mockResolvedValue({ refunded: true, credits: { remaining: 4 } });
});

describe('MyBookings — ventana de cancelación (F4-05)', () => {
  it('dentro de la ventana: dice hasta qué hora se puede cancelar', async () => {
    renderPage();
    expect(await screen.findByText(/Podés cancelar hasta las/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(false);
  });

  it('fuera de la ventana: lo explica y deshabilita, sin dejar que se coma el error', async () => {
    // Clase en 1 h con ventana de 2 h: ya no se puede.
    bookingsMock.mockResolvedValue({
      items: [booking({ session: { ...booking().session, startsAt: inHours(1) } })],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText('Ya no se puede cancelar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true);
  });

  it('cancelar saca la reserva de la lista y avisa', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/Se te devuelve 1 clase al pack 8 clases/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    await waitFor(() => {
      expect(cancelMock).toHaveBeenCalledWith('b1');
    });
    expect(await screen.findByText(/Te devolvimos la clase/)).toBeTruthy();
    expect(screen.getByText('No tenés clases anotadas')).toBeTruthy();
  });

  it('avisa cuando el crédito vuelve a un pack que ya venció (RN-08)', async () => {
    creditsMock.mockResolvedValue(credits('expired'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/ya venció: no vas a poder usarlo/)).toBeTruthy();
  });

  it('sin pack vencido no aparece la advertencia', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/Se te devuelve 1 clase/)).toBeTruthy();
    expect(screen.queryByText(/no vas a poder usarlo/)).toBeNull();
  });

  it('si el servidor cierra la ventana primero, se explica y se recarga (sin crash)', async () => {
    cancelMock.mockRejectedValue(
      new ApiError(409, 'CANCELLATION_WINDOW_CLOSED', 'La clase se cancela hasta 2 h antes.'),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const callsBefore = bookingsMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    expect(await screen.findByText(/Se cerró la ventana de cancelación/)).toBeTruthy();
    await waitFor(() => {
      expect(bookingsMock.mock.calls.length).toBe(callsBefore + 1); // refresca el estado
    });
  });

  it('cambiar de horario cancela y vuelve a la grilla en el día de esa clase', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar de horario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar y elegir otra' }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(expect.stringMatching(/^\/\?day=\d{4}-\d{2}-\d{2}$/));
    });
  });

  it('historial: cada estado con su etiqueta', async () => {
    renderPage();
    bookingsMock.mockResolvedValue({
      items: [
        booking({ id: 'b2', status: 'cancelled_by_user' }),
        booking({ id: 'b3', status: 'cancelled_by_gym' }),
      ],
      nextCursor: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));

    expect(await screen.findByText('La cancelaste')).toBeTruthy();
    expect(screen.getByText('La canceló el gimnasio')).toBeTruthy();
  });

  it('paginación: "cargar más" agrega sin duplicar', async () => {
    bookingsMock.mockResolvedValueOnce({ items: [booking()], nextCursor: 'b1' });
    bookingsMock.mockResolvedValueOnce({ items: [booking({ id: 'b9' })], nextCursor: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    });
    expect(screen.getAllByText(/crossfit/)).toHaveLength(2);
  });
});
