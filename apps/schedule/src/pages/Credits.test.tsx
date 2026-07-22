import type { CreditsDto } from '@bv/contracts';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Pantalla de saldo (F4-06): los 4 estados, el FIFO y el que todavía no arrancó. */

const creditsMock = vi.fn<() => Promise<CreditsDto>>();

vi.mock('../api/endpoints', () => ({
  api: { me: { credits: () => creditsMock() } },
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

const { Credits } = await import('./Credits');

const pack = (over: Partial<CreditsDto['packs'][number]>): CreditsDto['packs'][number] => ({
  id: 'p1',
  name: 'Pack',
  remaining: 5,
  total: 8,
  status: 'active',
  startsAt: '2026-07-01T00:00:00.000Z',
  expiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Credits (F4-06)', () => {
  it('activos primero, con la etiqueta de cuál se usa primero', async () => {
    creditsMock.mockResolvedValue({
      packs: [
        pack({ id: 'usable', name: '8 clases', remaining: 5 }),
        pack({
          id: 'futuro',
          name: '12 clases',
          remaining: 12,
          total: 12,
          usableFrom: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        }),
      ],
      totalRemaining: 5,
      nextExpiration: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    });
    render(<Credits />);

    expect(await screen.findByText('Activos')).toBeTruthy();
    expect(screen.getByText('Se usa primero')).toBeTruthy(); // solo uno
    expect(screen.getAllByText('Se usa primero')).toHaveLength(1);
    // El que arranca más adelante lo dice en vez de mostrar un saldo usable.
    expect(screen.getByText(/Disponible desde el/)).toBeTruthy();
    expect(screen.getByText(/Podés reservar/).textContent).toContain('5');
  });

  it('vencimiento en palabras y en fecha', async () => {
    creditsMock.mockResolvedValue({
      packs: [pack({ name: '8 clases' })],
      totalRemaining: 5,
      nextExpiration: null,
    });
    render(<Credits />);
    expect(await screen.findByText(/Vence el \d{2}\/\d{2} · en 12 días/)).toBeTruthy();
  });

  it('los estados terminados quedan en un historial colapsado', async () => {
    creditsMock.mockResolvedValue({
      packs: [
        pack({ id: 'a', status: 'active' }),
        pack({ id: 'b', name: 'Pack chico', status: 'exhausted', remaining: 0 }),
        pack({ id: 'c', name: 'Pack viejo', status: 'expired' }),
        pack({ id: 'd', name: 'Pack anulado por el gym', status: 'cancelled' }),
      ],
      totalRemaining: 5,
      nextExpiration: null,
    });
    render(<Credits />);

    const toggle = await screen.findByRole('button', { name: /Historial \(3\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Agotado')).toBeNull();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText('Vencido')).toBeTruthy();
    });
    // Cada uno con su badge de estado.
    expect(screen.getByText('Agotado')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();
  });

  it('sin packs explica cómo conseguir uno (el atleta no compra solo)', async () => {
    creditsMock.mockResolvedValue({ packs: [], totalRemaining: 0, nextExpiration: null });
    render(<Credits />);
    expect(await screen.findByText('No tenés packs activos')).toBeTruthy();
    expect(screen.getByText(/Pedile a tu gimnasio/)).toBeTruthy();
  });

  it('error de carga con reintento', async () => {
    creditsMock.mockRejectedValueOnce(new Error('sin red'));
    render(<Credits />);
    expect(await screen.findByRole('alert')).toBeTruthy();

    creditsMock.mockResolvedValue({ packs: [], totalRemaining: 0, nextExpiration: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
