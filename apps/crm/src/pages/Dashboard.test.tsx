import type { DashboardDto } from '@bv/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Dashboard del CRM (F3-10). */

const dashboardMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: { stats: { dashboard: () => dashboardMock() as unknown } },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    memberships: [{ orgId: 'o1', timezone: 'America/Argentina/Buenos_Aires' }],
    activeOrgId: 'o1',
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const { Dashboard } = await import('./Dashboard');

const base = (over: Partial<DashboardDto> = {}): DashboardDto => ({
  today: {
    date: '2026-07-15',
    sessions: [
      { id: 's1', startsAt: '2026-07-15T12:30:00.000Z', discipline: 'hyrox', bookedCount: 3, capacity: 12 },
      { id: 's2', startsAt: '2026-07-15T22:00:00.000Z', discipline: 'crossfit', bookedCount: 12, capacity: 12 },
    ],
  },
  week: { from: '2026-07-13', to: '2026-07-19', bookings: 42, cancellations: 5 },
  expiringAssignments: [
    {
      assignmentId: 'a1',
      membershipId: 'm1',
      memberName: 'Ana Fuerte',
      packName: 'Pack 8',
      expiresAt: '2026-07-21T23:59:59.000Z',
      daysLeft: 6,
      remaining: 5,
    },
  ],
  inactiveMembers: [
    {
      membershipId: 'm2',
      memberName: 'Bruno Ausente',
      lastBookingAt: '2026-06-20T14:00:00.000Z',
      daysInactive: 25,
    },
  ],
  month: { from: '2026-07-01', to: '2026-07-31', revenue: 77_000, newMembers: 3 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  dashboardMock.mockResolvedValue({ dashboard: base() });
});

describe('Dashboard (F3-10)', () => {
  it('una sola llamada trae todo lo que se pinta', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('$ 77.000')).toBeTruthy();
    expect(dashboardMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3')).toBeTruthy(); // nuevos miembros
    expect(screen.getByText('42')).toBeTruthy(); // reservas de la semana
    expect(screen.getByText(/5 cancelaciones/)).toBeTruthy();
  });

  it('las clases de hoy se muestran en la hora del gimnasio, no en la del navegador', async () => {
    render(<Dashboard />);
    // 12:30Z y 22:00Z en Buenos Aires (UTC-3) son las 09:30 y las 19:00.
    expect(await screen.findByText(/09:30 · hyrox/)).toBeTruthy();
    expect(screen.getByText(/19:00 · crossfit/)).toBeTruthy();
    expect(screen.getByText('12/12')).toBeTruthy();
    expect(screen.getByText('completa')).toBeTruthy();
  });

  it('tocar un vencimiento lleva a la ficha de esa persona', async () => {
    render(<Dashboard />);
    fireEvent.click(await screen.findByText('Ana Fuerte'));
    expect(navigateMock).toHaveBeenCalledWith('/clients/m1');
  });

  it('tocar un inactivo lleva a su ficha; tocar una clase, a la grilla', async () => {
    render(<Dashboard />);
    fireEvent.click(await screen.findByText('Bruno Ausente'));
    expect(navigateMock).toHaveBeenCalledWith('/clients/m2');

    fireEvent.click(screen.getByText(/09:30 · hyrox/));
    expect(navigateMock).toHaveBeenLastCalledWith('/classes');
  });

  it('el vencimiento se dice en días, no en fecha cruda', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('vence en 6 días')).toBeTruthy();
    expect(screen.getByText(/5 clases sin usar/)).toBeTruthy();
  });

  it('sin nada pendiente los vacíos son buenas noticias, no huecos', async () => {
    dashboardMock.mockResolvedValue({
      dashboard: base({ expiringAssignments: [], inactiveMembers: [] }),
    });
    render(<Dashboard />);
    expect(await screen.findByText('Nadie por vencer 🎉')).toBeTruthy();
    expect(screen.getByText('Están viniendo todos 💪')).toBeTruthy();
  });

  it('quien nunca reservó se distingue del que dejó de venir', async () => {
    dashboardMock.mockResolvedValue({
      dashboard: base({
        inactiveMembers: [
          { membershipId: 'm3', memberName: 'Nunca Vino', lastBookingAt: null, daysInactive: 20 },
        ],
      }),
    });
    render(<Dashboard />);
    expect(await screen.findByText('sin ninguna reserva')).toBeTruthy();
    expect(screen.getByText('nunca reservó — 20 días de alta')).toBeTruthy();
  });

  it('un error se muestra sin tumbar la pantalla', async () => {
    dashboardMock.mockRejectedValue(new Error('sin red'));
    render(<Dashboard />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
