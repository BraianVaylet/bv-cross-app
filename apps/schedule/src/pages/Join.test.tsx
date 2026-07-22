import type { MembershipSummaryDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';

// Mocks de dependencias del componente (la lógica pura vive en joinLogic.test.ts).
const joinMock = vi.fn();
const resendMock = vi.fn().mockResolvedValue({ sent: true });
const refreshMock = vi.fn<() => Promise<MembershipSummaryDto[]>>();
const selectOrgMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    orgs: { join: (code: string) => joinMock(code) as unknown },
    auth: { resendVerification: (email: string) => resendMock(email) as unknown },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@demo.test', name: 'Ana', emailVerified: true },
    memberships: [],
    activeOrgId: null,
    refreshMemberships: refreshMock,
    selectOrg: selectOrgMock,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  useNavigate: () => navigateMock,
}));

// Importado DESPUÉS de los mocks para que el componente los reciba.
const { Join } = await import('./Join');

function renderJoin() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Join />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function typeCode(value: string): HTMLInputElement {
  const input = screen.getByPlaceholderText<HTMLInputElement>('ej: bahia-cross-demo');
  fireEvent.change(input, { target: { value } });
  return input;
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));

beforeEach(() => {
  refreshMock.mockResolvedValue([
    { id: 'm1', orgId: 'o1', orgName: 'Bahía Cross', orgSlug: 'bahia', role: 'athlete', status: 'active', timezone: 'America/Argentina/Buenos_Aires', sessionGenerationDays: 14, cancellationWindowHours: 2 },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Join — mapeo de errores (F2-04 caso 1)', () => {
  it('ORG_CODE_INVALID → mensaje de código inválido', async () => {
    joinMock.mockRejectedValueOnce(new ApiError(404, 'ORG_CODE_INVALID', 'x'));
    renderJoin();
    typeCode('bahia-cross');
    submit();
    expect(await screen.findByText(/Código inválido/)).toBeTruthy();
  });

  it('EMAIL_NOT_VERIFIED → mensaje + CTA de reenvío que dispara resendVerification', async () => {
    joinMock.mockRejectedValueOnce(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'x'));
    renderJoin();
    typeCode('bahia-cross');
    submit();
    expect(await screen.findByText(/Verificá tu email/)).toBeTruthy();
    fireEvent.click(screen.getByText('Reenviar verificación'));
    await waitFor(() => {
      expect(resendMock).toHaveBeenCalledWith('ana@demo.test');
    });
    expect(await screen.findByText(/te reenviamos el mail/)).toBeTruthy();
  });

  it('RATE_LIMITED → mensaje de esperar', async () => {
    joinMock.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'x'));
    renderJoin();
    typeCode('bahia-cross');
    submit();
    expect(await screen.findByText(/Demasiados intentos/)).toBeTruthy();
  });
});

describe('Join — normalización (F2-04 caso 2)', () => {
  it('" BAHIA-Cross-x9k2 " se muestra y se envía como "bahia-cross-x9k2"', async () => {
    joinMock.mockResolvedValueOnce({ membership: { orgId: 'o1', orgName: 'Bahía Cross' } });
    renderJoin();
    const input = typeCode(' BAHIA-Cross-x9k2 ');
    expect(input.value).toBe('bahia-cross-x9k2');
    submit();
    await waitFor(() => {
      expect(joinMock).toHaveBeenCalledWith('bahia-cross-x9k2');
    });
  });
});

describe('Join — doble submit (F2-04 caso 3)', () => {
  it('dos clicks seguidos → un solo POST', async () => {
    let resolveJoin: (v: unknown) => void = () => undefined;
    joinMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveJoin = resolve;
      }),
    );
    renderJoin();
    typeCode('bahia-cross');
    submit();
    submit(); // segundo click en el mismo tick, con el POST en vuelo
    resolveJoin({ membership: { orgId: 'o1', orgName: 'Bahía Cross' } });
    await waitFor(() => {
      expect(joinMock).toHaveBeenCalledTimes(1);
    });
  });
});
