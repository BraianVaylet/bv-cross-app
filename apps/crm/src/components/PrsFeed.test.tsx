import type { PrEntryDto } from '@bv/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Feed de récords del gimnasio (F3-09). */

const feedMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: { stats: { prsFeed: (limit: number) => feedMock(limit) as unknown } },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

const { PrsFeed } = await import('./PrsFeed');

const ymdAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const pr = (over: Partial<PrEntryDto> = {}): PrEntryDto => ({
  id: 'e1',
  userId: 'u1',
  userName: 'María',
  exerciseId: 'x1',
  exerciseName: 'Sentadilla',
  type: 'weight',
  value: 85,
  improvement: 5,
  date: ymdAgo(0),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  feedMock.mockResolvedValue({ items: [pr()] });
});

describe('PrsFeed (F3-09)', () => {
  it('dice quién, qué, cuánto y cuánto mejoró', async () => {
    render(<PrsFeed />);
    const fila = await screen.findByRole('listitem');
    expect(fila.textContent).toContain('María');
    expect(fila.textContent).toContain('Sentadilla');
    expect(fila.textContent).toContain('85 kg');
    expect(fila.textContent).toContain('(+5)');
  });

  it('la primera marca de alguien no muestra mejora', async () => {
    feedMock.mockResolvedValue({ items: [pr({ improvement: null })] });
    render(<PrsFeed />);
    const fila = await screen.findByRole('listitem');
    expect(fila.textContent).not.toContain('(+');
  });

  it('las repeticiones se leen como reps, no como kilos', async () => {
    feedMock.mockResolvedValue({
      items: [pr({ type: 'reps', exerciseName: 'Dominadas', value: 12 })],
    });
    render(<PrsFeed />);
    expect((await screen.findByRole('listitem')).textContent).toContain('12 reps');
  });

  it('las fechas recientes se leen en palabras', async () => {
    feedMock.mockResolvedValue({
      items: [
        pr({ id: 'a', date: ymdAgo(0) }),
        pr({ id: 'b', date: ymdAgo(1) }),
        pr({ id: 'c', date: ymdAgo(3) }),
        pr({ id: 'd', date: '2026-01-12' }),
      ],
    });
    render(<PrsFeed />);
    expect(await screen.findByText('hoy')).toBeTruthy();
    expect(screen.getByText('ayer')).toBeTruthy();
    expect(screen.getByText('hace 3 días')).toBeTruthy();
    expect(screen.getByText('12/01')).toBeTruthy(); // lo viejo, con fecha
  });

  it('sin récords explica cuándo van a aparecer', async () => {
    feedMock.mockResolvedValue({ items: [] });
    render(<PrsFeed />);
    expect(await screen.findByText('Todavía no hay récords')).toBeTruthy();
  });

  it('un error de carga se muestra sin romper la pantalla', async () => {
    feedMock.mockRejectedValue(new Error('sin red'));
    render(<PrsFeed />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
