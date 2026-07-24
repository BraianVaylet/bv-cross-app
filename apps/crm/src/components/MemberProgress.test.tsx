import type { ExerciseDto, ProgressDto } from '@bv/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Tab de progreso de la ficha (F3-09). */

const exercisesMock = vi.fn();
const progressMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    stats: {
      memberExercises: (id: string) => exercisesMock(id) as unknown,
      memberProgress: (id: string, ex: string) => progressMock(id, ex) as unknown,
    },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

const { MemberProgress } = await import('./MemberProgress');

const exercise = (id: string, name: string): ExerciseDto => ({
  id,
  scope: 'org',
  name,
  type: 'weight',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const progress = (over: Partial<ProgressDto> = {}): ProgressDto => ({
  exerciseId: 'x1',
  exerciseName: 'Sentadilla',
  type: 'weight',
  points: [
    { id: 'p1', value: 60, date: '2026-01-05', isPr: true },
    { id: 'p2', value: 70, date: '2026-02-05', isPr: true },
    { id: 'p3', value: 65, date: '2026-03-05', isPr: false },
  ],
  currentRm: 65,
  best: 70,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  exercisesMock.mockResolvedValue({ items: [exercise('x1', 'Sentadilla'), exercise('x2', 'Peso muerto')] });
  progressMock.mockResolvedValue({ progress: progress() });
});

describe('MemberProgress (F3-09)', () => {
  it('arranca con el primer ejercicio y muestra su evolución', async () => {
    render(<MemberProgress memberId="m1" />);
    await waitFor(() => {
      expect(progressMock).toHaveBeenCalledWith('m1', 'x1');
    });
    expect(await screen.findByRole('img', { name: /Evolución de Sentadilla/ })).toBeTruthy();
  });

  it('separa el RM vigente del mejor histórico (RN-22)', async () => {
    render(<MemberProgress memberId="m1" />);
    // Bajó de marca: vigente 65, mejor 70. Los dos números tienen que verse
    // en el resumen (el gráfico también los nombra en su aria-label).
    expect((await screen.findByText(/Vigente:/)).textContent).toContain('65 kg');
    expect(screen.getByText(/Mejor marca:/).textContent).toContain('70 kg');
    expect(screen.getByText(/El vigente es el más reciente, no el más alto/)).toBeTruthy();
  });

  it('el historial marca los PRs, del más nuevo al más viejo', async () => {
    render(<MemberProgress memberId="m1" />);
    const filas = await screen.findAllByRole('row');
    // Primera fila de datos = la carga más reciente.
    expect(filas[1]?.textContent).toContain('05/03');
    expect(screen.getAllByText('PR')).toHaveLength(2);
  });

  it('cambiar de ejercicio vuelve a pedir el progreso', async () => {
    render(<MemberProgress memberId="m1" />);
    await waitFor(() => {
      expect(progressMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('Ejercicio'), { target: { value: 'x2' } });
    await waitFor(() => {
      expect(progressMock).toHaveBeenLastCalledWith('m1', 'x2');
    });
  });

  it('sin cargas explica qué falta, sin selector vacío', async () => {
    exercisesMock.mockResolvedValue({ items: [] });
    render(<MemberProgress memberId="m1" />);
    expect(await screen.findByText('Todavía no cargó nada')).toBeTruthy();
    expect(screen.queryByLabelText('Ejercicio')).toBeNull();
  });

  it('las repeticiones se muestran con su unidad', async () => {
    progressMock.mockResolvedValue({
      progress: progress({
        type: 'reps',
        exerciseName: 'Dominadas',
        points: [{ id: 'p1', value: 12, date: '2026-05-01', isPr: true }],
        currentRm: 12,
        best: 12,
      }),
    });
    render(<MemberProgress memberId="m1" />);
    expect((await screen.findByText(/Vigente:/)).textContent).toContain('12 reps');
  });

  it('un error se muestra sin tumbar la pantalla', async () => {
    exercisesMock.mockRejectedValue(new Error('sin red'));
    render(<MemberProgress memberId="m1" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
