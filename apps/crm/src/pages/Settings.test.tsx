import type { MemberDto, OrgDto, Role } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Configuración de la org (F3-11): secciones por rol, código y admins. */

const currentMock = vi.fn();
const updateOrgMock = vi.fn();
const regenerateMock = vi.fn();
const membersListMock = vi.fn();
const membersUpdateMock = vi.fn();

/** Rol del usuario logueado: cada test lo fija antes de renderizar. */
const auth = vi.hoisted(() => ({ role: 'owner' }));

vi.mock('../api/endpoints', () => ({
  api: {
    orgs: {
      current: () => currentMock() as unknown,
      update: (body: unknown) => updateOrgMock(body) as unknown,
      regenerateCode: () => regenerateMock() as unknown,
    },
    members: {
      list: (params: unknown) => membersListMock(params) as unknown,
      update: (id: string, body: unknown) => membersUpdateMock(id, body) as unknown,
    },
  },
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    memberships: [
      {
        id: 'mm1',
        orgId: 'o1',
        orgName: 'Bahía Cross',
        orgSlug: 'bahia',
        role: auth.role,
        status: 'active',
        timezone: 'America/Argentina/Buenos_Aires',
        sessionGenerationDays: 14,
        cancellationWindowHours: 2,
      },
    ],
    activeOrgId: 'o1',
  }),
}));

const { ApiError } = await import('../api/client');
const { Settings } = await import('./Settings');

const org = (over: Partial<OrgDto> = {}): OrgDto => ({
  id: 'o1',
  name: 'Bahía Cross',
  slug: 'bahia-cross',
  timezone: 'America/Argentina/Buenos_Aires',
  settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
  joinCode: 'bahia-cross-x9k2',
  ...over,
});

const member = (id: string, role: Role, name: string, withUser = true): MemberDto => ({
  id,
  role,
  status: 'active',
  profile: { displayName: name },
  ...(withUser ? { user: { id: `u-${id}`, name, email: `${name.toLowerCase()}@test.com` } } : {}),
  createdAt: '2026-07-01T00:00:00.000Z',
});

const renderPage = () =>
  render(
    <ToastProvider>
      <Settings />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = 'owner';
  currentMock.mockResolvedValue({ org: org() });
  membersListMock.mockResolvedValue({
    items: [member('m1', 'owner', 'Olivia'), member('m2', 'athlete', 'Ana')],
    nextCursor: null,
  });
});

describe('Settings (F3-11)', () => {
  it('el owner ve todas las secciones', async () => {
    renderPage();
    expect(await screen.findByText('Tu gimnasio')).toBeTruthy();
    expect(screen.getByText('Reglas de reserva')).toBeTruthy();
    expect(screen.getByText('Código de acceso')).toBeTruthy();
    expect(screen.getByText('Quién administra')).toBeTruthy();
  });

  it('el admin no ve nada de owner y se le explica por qué', async () => {
    auth.role = 'admin';
    renderPage();
    expect(await screen.findByText(/La configuración del gimnasio la maneja el dueño/)).toBeTruthy();
    for (const seccion of ['Tu gimnasio', 'Reglas de reserva', 'Código de acceso', 'Quién administra']) {
      expect(screen.queryByText(seccion)).toBeNull();
    }
  });

  it('las políticas explican su efecto y se guardan', async () => {
    updateOrgMock.mockResolvedValue({
      org: org({ settings: { cancellationWindowHours: 4, sessionGenerationDays: 14 } }),
    });
    renderPage();

    // El texto cambia con el valor elegido: no es una etiqueta muerta.
    expect(await screen.findByText(/pueden cancelar hasta 2 h antes/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cancelación'), { target: { value: '4' } });
    expect(screen.getByText(/pueden cancelar hasta 4 h antes/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar' }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(updateOrgMock).toHaveBeenCalledWith({
        settings: { cancellationWindowHours: 4, sessionGenerationDays: 14 },
      });
    });
  });

  it('ventana 0 se explica distinto', async () => {
    currentMock.mockResolvedValue({
      org: org({ settings: { cancellationWindowHours: 0, sessionGenerationDays: 14 } }),
    });
    renderPage();
    expect(await screen.findByText(/Se puede cancelar hasta que la clase empieza/)).toBeTruthy();
  });

  it('regenerar el código avisa que el anterior deja de servir', async () => {
    regenerateMock.mockResolvedValue({ org: org({ joinCode: 'bahia-cross-nuevo' }) });
    renderPage();

    expect(await screen.findByText('bahia-cross-x9k2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar' }));
    expect(screen.getByText(/El código anterior deja de funcionar al instante/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Regenerar' }).at(-1) as HTMLElement);
    expect(await screen.findByText('bahia-cross-nuevo')).toBeTruthy();
  });

  it('copiar código e invitación usan el portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar código' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('bahia-cross-x9k2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copiar invitación' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2);
    });
    expect(writeText.mock.calls[1]?.[0]).toContain('Bahía Cross');
  });

  it('promover a admin explica qué puede y qué no', async () => {
    membersUpdateMock.mockResolvedValue({ member: member('m2', 'admin', 'Ana') });
    renderPage();

    fireEvent.change(await screen.findByLabelText('Sumar administrador'), {
      target: { value: 'm2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));

    expect(screen.getByText(/No va a poder cambiar la configuración del gimnasio/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Sumar' }).at(-1) as HTMLElement);

    await waitFor(() => {
      expect(membersUpdateMock).toHaveBeenCalledWith('m2', { role: 'admin' });
    });
    expect(await screen.findByText('Admin')).toBeTruthy();
  });

  it('quitar admin aclara que no pierde su historial', async () => {
    membersListMock.mockResolvedValue({
      items: [member('m1', 'owner', 'Olivia'), member('m3', 'admin', 'Andrés')],
      nextCursor: null,
    });
    membersUpdateMock.mockResolvedValue({ member: member('m3', 'athlete', 'Andrés') });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar' }));
    expect(screen.getByText(/No pierde su historial ni sus packs/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' }).at(-1) as HTMLElement);
    await waitFor(() => {
      expect(membersUpdateMock).toHaveBeenCalledWith('m3', { role: 'athlete' });
    });
  });

  it('el dueño no aparece como degradable', async () => {
    renderPage();
    await screen.findByText('Quién administra');
    expect(screen.getByText('Dueño')).toBeTruthy();
    // El único "Quitar" posible sería el del owner: no existe.
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
  });

  it('una pre-carga sin cuenta no se puede promover', async () => {
    membersListMock.mockResolvedValue({
      items: [member('m1', 'owner', 'Olivia'), member('m9', 'athlete', 'Emilia', false)],
      nextCursor: null,
    });
    renderPage();

    await screen.findByText('Quién administra');
    expect(screen.queryByLabelText('Sumar administrador')).toBeNull();
  });

  it('CANNOT_MODIFY_OWNER del servidor se explica en castellano', async () => {
    membersListMock.mockResolvedValue({
      items: [member('m1', 'owner', 'Olivia'), member('m3', 'admin', 'Andrés')],
      nextCursor: null,
    });
    membersUpdateMock.mockRejectedValue(
      new ApiError(403, 'CANNOT_MODIFY_OWNER', 'La cuenta owner no se puede modificar.'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Quitar' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' }).at(-1) as HTMLElement);
    expect(await screen.findByText('La cuenta del dueño no se puede cambiar.')).toBeTruthy();
  });
});
