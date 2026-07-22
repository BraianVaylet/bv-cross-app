import type { CreditsDto, SessionDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Flujo de reserva (F4-04 casos 4 y 5). Lo que se prueba acá es la promesa de
 * la pantalla: dos taps para reservar, saldo actualizado con la respuesta del
 * POST (sin refetch), y cada error del servicio con una salida visible.
 */

const listMock = vi.fn<() => Promise<{ items: SessionDto[] }>>();
const creditsMock = vi.fn<() => Promise<CreditsDto>>();
const createMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    sessions: { list: () => listMock() },
    me: { credits: () => creditsMock() },
    bookings: { create: (id: string) => createMock(id) as unknown },
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
const { Grid } = await import('./Grid');

/** Mañana a las 18:00 de Buenos Aires: siempre futura, siempre reservable. */
function tomorrowAt(hour: number): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setUTCHours(hour + 3, 0, 0, 0); // AR es UTC-3
  return d.toISOString();
}

const session = (over: Partial<SessionDto> = {}): SessionDto => ({
  id: 's1',
  templateId: null,
  startsAt: tomorrowAt(18),
  endsAt: tomorrowAt(19),
  discipline: 'crossfit',
  capacity: 10,
  bookedCount: 4,
  status: 'scheduled',
  myBookingId: null,
  ...over,
});

const credits = (over: Partial<CreditsDto> = {}): CreditsDto => ({
  packs: [
    {
      id: 'p1',
      name: '8 clases',
      remaining: 5,
      total: 8,
      status: 'active',
      startsAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T23:59:59.999Z',
    },
  ],
  totalRemaining: 5,
  nextExpiration: '2026-08-01T23:59:59.999Z',
  ...over,
});

function renderGrid() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Grid />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Abre el día de la sesión (mañana) y toca la card: primer tap. */
async function openTomorrowAndTap(): Promise<void> {
  const tomorrow = new Date(Date.now() + 86_400_000).getUTCDate();
  const tab = await screen.findByRole('tab', { name: new RegExp(`${String(tomorrow)}$`) });
  fireEvent.click(tab);
  fireEvent.click(await screen.findByRole('button', { name: /18:00/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ items: [session()] });
  creditsMock.mockResolvedValue(credits());
});

describe('Grid — flujo de reserva (F4-04)', () => {
  it('confirma con el pack FIFO y actualiza card y saldo con la respuesta del POST', async () => {
    createMock.mockResolvedValue({
      booking: { id: 'b1' },
      session: { id: 's1', bookedCount: 5, capacity: 10 },
      credits: { remaining: 4, packName: '8 clases', expiresAt: '2026-08-01T23:59:59.999Z' },
    });
    renderGrid();
    expect(await screen.findByText(/5 clases/)).toBeTruthy(); // badge inicial

    await openTomorrowAndTap();

    // La confirmación dice de dónde sale el crédito y cuánto queda.
    expect(await screen.findByText(/Se descuenta de:/)).toBeTruthy();
    expect(screen.getByText(/8 clases/)).toBeTruthy();
    expect(screen.getByText(/te quedan 4/)).toBeTruthy();

    const callsBefore = listMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' })); // segundo tap

    await waitFor(() => {
      expect(screen.getByText('Estás anotado')).toBeTruthy();
    });
    // Un POST y CERO refetch: la card y el badge se pintan con la respuesta.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith('s1');
    expect(listMock.mock.calls.length).toBe(callsBefore);
    expect(creditsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('5/10')).toBeTruthy(); // cupo de la respuesta
    expect(screen.getByText(/4 clases/)).toBeTruthy(); // saldo descontado
  });

  it('SESSION_FULL: avisa y vuelve a pedir el día para mostrar el cupo real', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'SESSION_FULL', 'La clase está completa.'));
    renderGrid();
    await openTomorrowAndTap();

    const callsBefore = listMock.mock.calls.length;
    listMock.mockResolvedValue({ items: [session({ bookedCount: 10 })] });
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }));

    await waitFor(() => {
      expect(screen.getByText(/Se llenó justo ahora/)).toBeTruthy();
    });
    expect(listMock.mock.calls.length).toBe(callsBefore + 1); // refetch
    await waitFor(() => {
      expect(screen.getByText('Completa')).toBeTruthy();
    });
  });

  it('NO_CREDITS: ofrece ir al saldo en vez de dejar al atleta con un error seco', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'NO_CREDITS', 'No tenés clases disponibles.'));
    renderGrid();
    await openTomorrowAndTap();
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver mi saldo' }));
    expect(navigateMock).toHaveBeenCalledWith('/credits');
  });

  it('ALREADY_BOOKED: la card queda reservada igual (idempotencia visual)', async () => {
    createMock.mockRejectedValue(new ApiError(409, 'ALREADY_BOOKED', 'Ya estás anotado.'));
    renderGrid();
    await openTomorrowAndTap();

    listMock.mockResolvedValue({ items: [session({ myBookingId: 'b-previa' })] });
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }));

    await waitFor(() => {
      expect(screen.getByText('Estás anotado')).toBeTruthy();
    });
  });

  it('sin saldo el badge dice qué hacer', async () => {
    creditsMock.mockResolvedValue(credits({ packs: [], totalRemaining: 0, nextExpiration: null }));
    renderGrid();
    expect(await screen.findByText(/hablá con tu gimnasio/)).toBeTruthy();
  });

  it('la grilla no navega más allá del horizonte materializado', async () => {
    listMock.mockResolvedValue({ items: [] }); // el horizonte no depende de que haya clases
    renderGrid();
    await screen.findAllByRole('tab');

    // Cuántas semanas se puede avanzar depende del día en que caiga hoy: lo que
    // importa es que el horizonte de 14 días corte, y en pocas semanas.
    const next = () => screen.getByRole('button', { name: 'Semana siguiente' });
    let avanzadas = 0;
    while (!next().hasAttribute('disabled') && avanzadas < 5) {
      fireEvent.click(next());
      avanzadas += 1;
      await waitFor(() => {
        expect(screen.getAllByRole('tab')).toHaveLength(7);
      });
    }
    expect(avanzadas).toBeGreaterThanOrEqual(1);
    expect(avanzadas).toBeLessThanOrEqual(3);
    expect(next().hasAttribute('disabled')).toBe(true);

    // En el borde, el vacío explica por qué no hay nada en vez de dejarlo mudo.
    expect(screen.getByText(/Las reservas se abren 14 días antes/)).toBeTruthy();

    // Volver sí se puede, hasta la semana actual.
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await waitFor(() => {
      expect(next().hasAttribute('disabled')).toBe(false);
    });
  });

  it('error de carga: banner con reintento', async () => {
    listMock.mockRejectedValueOnce(new Error('sin red'));
    renderGrid();
    expect(await screen.findByRole('alert')).toBeTruthy();

    listMock.mockResolvedValue({ items: [session()] });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
