import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';

const changePasswordMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    auth: { changePassword: (a: string, b: string) => changePasswordMock(a, b) as unknown },
    me: { update: (name: string) => updateMock(name) as unknown },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@demo.test', name: 'Ana', emailVerified: true },
    memberships: [{ id: 'm1', orgId: 'o1', orgName: 'Bahía Cross', orgSlug: 'bahia', role: 'athlete', status: 'active', timezone: 'America/Argentina/Buenos_Aires', sessionGenerationDays: 14, cancellationWindowHours: 2 }],
    activeOrgId: 'o1',
    logout: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  useNavigate: () => vi.fn(),
}));

const { Account } = await import('./Account');

function renderAccount() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Account />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Account — change-password (F2-06 caso 1)', () => {
  it('INVALID_CREDENTIALS → error bajo "Contraseña actual"', async () => {
    changePasswordMock.mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS', 'x'));
    renderAccount();

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'malapass' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'nuevapass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
    expect(changePasswordMock).toHaveBeenCalledWith('malapass', 'nuevapass123');
  });

  it('WEAK_PASSWORD → error bajo "Nueva contraseña"', async () => {
    changePasswordMock.mockRejectedValueOnce(new ApiError(400, 'WEAK_PASSWORD', 'Contraseña muy común.'));
    renderAccount();

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actualok1' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(await screen.findByText('Contraseña muy común.')).toBeTruthy();
  });

  it('éxito → limpia los campos', async () => {
    changePasswordMock.mockResolvedValueOnce({ changed: true });
    renderAccount();

    const current = screen.getByLabelText<HTMLInputElement>('Contraseña actual');
    const next = screen.getByLabelText<HTMLInputElement>('Nueva contraseña');
    fireEvent.change(current, { target: { value: 'actualok1' } });
    fireEvent.change(next, { target: { value: 'nuevapass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    await waitFor(() => {
      expect(current.value).toBe('');
    });
    expect(next.value).toBe('');
  });
});
