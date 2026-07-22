import type { ExerciseDto } from '@bv/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn<() => Promise<{ items: ExerciseDto[] }>>();

vi.mock('../api/endpoints', () => ({
  api: { exercises: { list: () => listMock(), remove: vi.fn() } },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.co', name: 'Ana', emailVerified: true },
    memberships: [{ id: 'm1', orgId: 'o1', orgName: 'Bahía Cross', orgSlug: 'bahia', role: 'athlete', status: 'active', timezone: 'America/Argentina/Buenos_Aires', sessionGenerationDays: 14, cancellationWindowHours: 2 }],
    activeOrgId: 'o1',
  }),
}));

const { Home } = await import('./Home');

const ex = (id: string, name: string, scope: 'org' | 'personal'): ExerciseDto => ({
  id,
  scope,
  name,
  type: 'weight',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listMock.mockResolvedValue({
    items: [ex('1', 'Back Squat', 'org'), ex('2', 'Mi Curl', 'personal')],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Home — acciones por sección (F2-05 caso 3)', () => {
  it('el catálogo no tiene editar/borrar; los personales sí', async () => {
    renderHome();
    // catálogo
    const catalogItem = (await screen.findByText('Back Squat')).closest('li');
    expect(catalogItem).not.toBeNull();
    expect(within(catalogItem as HTMLElement).queryByLabelText(/Editar/)).toBeNull();
    expect(within(catalogItem as HTMLElement).queryByLabelText(/Borrar/)).toBeNull();
    // personal
    const personalItem = screen.getByText('Mi Curl').closest('li');
    expect(within(personalItem as HTMLElement).getByLabelText('Editar Mi Curl')).toBeTruthy();
    expect(within(personalItem as HTMLElement).getByLabelText('Borrar Mi Curl')).toBeTruthy();
  });
});

describe('Home — búsqueda (F2-05 caso 4)', () => {
  it('filtra catálogo y personales a la vez', async () => {
    renderHome();
    await screen.findByText('Back Squat');
    const search = screen.getByLabelText('Buscar ejercicio');

    fireEvent.change(search, { target: { value: 'curl' } });
    await waitFor(() => {
      expect(screen.queryByText('Back Squat')).toBeNull();
    });
    expect(screen.getByText('Mi Curl')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'squat' } });
    await waitFor(() => {
      expect(screen.queryByText('Mi Curl')).toBeNull();
    });
    expect(screen.getByText('Back Squat')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
  });
});
