import type { ExerciseDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASIC_EXERCISES } from '../lib/basicExercises';

/** Catálogo de ejercicios (F3-08): TYPE_LOCKED comunicado y carga rápida. */

const listMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const archiveMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    exercises: {
      list: (includeArchived?: boolean) => listMock(includeArchived) as unknown,
      create: (body: unknown) => createMock(body) as unknown,
      update: (id: string, body: unknown) => updateMock(id, body) as unknown,
      archive: (id: string, archived: boolean) => archiveMock(id, archived) as unknown,
    },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

const { ApiError } = await import('../api/client');
const { Exercises } = await import('./Exercises');

const exercise = (over: Partial<ExerciseDto> = {}): ExerciseDto => ({
  id: 'e1',
  scope: 'org',
  name: 'Sentadilla trasera',
  discipline: 'weightlifting',
  type: 'weight',
  hasEntries: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <Exercises />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ items: [exercise()] });
});

describe('Exercises (F3-08)', () => {
  it('lista el catálogo con su tipo y disciplina', async () => {
    renderPage();
    expect(await screen.findByText('Sentadilla trasera')).toBeTruthy();
    expect(screen.getByText('Kilos')).toBeTruthy();
    expect(screen.getByText('weightlifting')).toBeTruthy();
  });

  it('con registros cargados bloquea el tipo y explica por qué (TYPE_LOCKED)', async () => {
    listMock.mockResolvedValue({ items: [exercise({ hasEntries: true })] });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByText(/invalidaría el historial de los atletas/)).toBeTruthy();
    // Los dos radios se apagan juntos desde el fieldset que los envuelve.
    for (const label of ['Kilos', 'Repeticiones']) {
      expect(screen.getByLabelText(label).closest('fieldset')?.disabled).toBe(true);
    }
    // Nombre y notas siguen editables.
    expect(screen.getByLabelText('Nombre').hasAttribute('disabled')).toBe(false);
  });

  it('con el tipo bloqueado, el campo `type` ni siquiera viaja al servidor', async () => {
    listMock.mockResolvedValue({ items: [exercise({ hasEntries: true })] });
    updateMock.mockResolvedValue({ exercise: exercise({ name: 'Back squat', hasEntries: true }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Back squat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('e1', {
        name: 'Back squat',
        discipline: 'weightlifting',
        imageUrl: null,
        notes: null,
      });
    });
  });

  it('sin registros el tipo se puede cambiar', async () => {
    updateMock.mockResolvedValue({ exercise: exercise({ type: 'reps' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.queryByText(/invalidaría el historial/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Repeticiones'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('e1', expect.objectContaining({ type: 'reps' }));
    });
  });

  it('una imagen rota muestra un aviso, no un ícono partido', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Imagen (URL)'), {
      target: { value: 'https://example.com/rota.png' },
    });
    const preview = screen.getByRole('img', { name: 'Vista previa' });
    fireEvent.error(preview);

    expect(await screen.findByText(/No pudimos cargar esa imagen/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Vista previa' })).toBeNull();
  });

  it('el catálogo vacío ofrece cargar el set básico de una', async () => {
    listMock.mockResolvedValue({ items: [] });
    createMock.mockImplementation((body: { name: string }) =>
      Promise.resolve({ exercise: exercise({ id: body.name, name: body.name }) }),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Cargar los ${String(BASIC_EXERCISES.length)} básicos` }),
    );
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(BASIC_EXERCISES.length);
    });
    // Todos van al catálogo del gimnasio, no a los personales de nadie.
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ scope: 'org' }));
    expect(await screen.findByText(/12 ejercicios cargados/)).toBeTruthy();
  });

  it('un duplicado no aborta el lote: se cuenta y sigue con el resto', async () => {
    listMock.mockResolvedValue({ items: [] });
    createMock.mockImplementation((body: { name: string }) =>
      body.name === 'Peso muerto'
        ? Promise.reject(new ApiError(400, 'VALIDATION_ERROR', 'Ya existe.'))
        : Promise.resolve({ exercise: exercise({ id: body.name, name: body.name }) }),
    );
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: `Cargar los ${String(BASIC_EXERCISES.length)} básicos` }),
    );
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(BASIC_EXERCISES.length);
    });
    expect(await screen.findByText(/11 ejercicios cargados; 1 ya existían/)).toBeTruthy();
  });

  it('archivar explica que el historial del atleta queda intacto (RN-19)', async () => {
    archiveMock.mockResolvedValue({
      exercise: exercise({ archivedAt: '2026-07-20T00:00:00.000Z' }),
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Archivar' }));
    expect(screen.getByText(/Los atletas conservan su historial/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Archivar' }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(archiveMock).toHaveBeenCalledWith('e1', true);
    });
    expect(await screen.findByRole('button', { name: /Archivados \(1\)/ })).toBeTruthy();
  });

  it('restaurar lo devuelve al catálogo', async () => {
    listMock.mockResolvedValue({ items: [exercise({ archivedAt: '2026-07-01T00:00:00.000Z' })] });
    archiveMock.mockResolvedValue({ exercise: exercise() });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Archivados \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => {
      expect(archiveMock).toHaveBeenCalledWith('e1', false);
    });
    expect(await screen.findByRole('button', { name: /En el catálogo \(1\)/ })).toBeTruthy();
  });

  it('crear un ejercicio lo manda al catálogo del gimnasio', async () => {
    createMock.mockResolvedValue({ exercise: exercise({ id: 'e2', name: 'Thruster' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo ejercicio' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Thruster' } });
    fireEvent.change(screen.getByLabelText('Disciplina'), { target: { value: 'crossfit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        name: 'Thruster',
        type: 'weight',
        scope: 'org',
        discipline: 'crossfit',
      });
    });
  });
});
