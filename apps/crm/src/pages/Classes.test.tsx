import type { AttendeeDto, SessionDto, TemplateDto } from '@bv/contracts';
import { ToastProvider } from '@bv/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sección Clases (F3-06): grilla de templates y calendario de sesiones.
 * Lo que se prueba es lo que el dueño tiene que entender antes de tocar:
 * la propagación RN-05, el desglose al borrar, y el cupo/cancelación de una
 * clase con gente anotada.
 */

const templatesListMock = vi.fn();
const templatesCreateMock = vi.fn();
const templatesUpdateMock = vi.fn();
const templatesRemoveMock = vi.fn();
const sessionsListMock = vi.fn();
const sessionsUpdateMock = vi.fn();
const sessionsCancelMock = vi.fn();
const attendeesMock = vi.fn();

vi.mock('../api/endpoints', () => ({
  api: {
    templates: {
      list: () => templatesListMock() as unknown,
      create: (body: unknown) => templatesCreateMock(body) as unknown,
      update: (id: string, body: unknown) => templatesUpdateMock(id, body) as unknown,
      remove: (id: string) => templatesRemoveMock(id) as unknown,
    },
    sessions: {
      list: (from: string, to: string) => sessionsListMock(from, to) as unknown,
      create: vi.fn(),
      update: (id: string, body: unknown) => sessionsUpdateMock(id, body) as unknown,
      cancel: (id: string) => sessionsCancelMock(id) as unknown,
      attendees: (id: string) => attendeesMock(id) as unknown,
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
        role: 'owner',
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
const { Classes } = await import('./Classes');

const template = (over: Partial<TemplateDto> = {}): TemplateDto => ({
  id: 't1',
  weekday: 1,
  startTime: '18:00',
  durationMin: 60,
  discipline: 'crossfit',
  capacity: 12,
  active: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

/** Sesión de hoy a las 18:00 de Buenos Aires (21:00Z). */
function todaySession(over: Partial<SessionDto> = {}): SessionDto {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    id: 's1',
    templateId: 't1',
    startsAt: `${hoy}T21:00:00.000Z`,
    endsAt: `${hoy}T22:00:00.000Z`,
    discipline: 'crossfit',
    capacity: 12,
    bookedCount: 4,
    status: 'scheduled',
    myBookingId: null,
    ...over,
  };
}

const attendee = (over: Partial<AttendeeDto> = {}): AttendeeDto => ({
  bookingId: 'b1',
  userId: 'u1',
  name: 'Ana Fuerte',
  bookedAt: '2026-07-20T14:30:00.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <Classes />
    </ToastProvider>,
  );

const irAlCalendario = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Calendario' }));
  await waitFor(() => {
    expect(sessionsListMock).toHaveBeenCalled();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  templatesListMock.mockResolvedValue({ items: [template()] });
  sessionsListMock.mockResolvedValue({ items: [todaySession()] });
  attendeesMock.mockResolvedValue({ items: [attendee()] });
});

describe('Classes — grilla semanal (F3-06)', () => {
  it('ubica cada horario en su día', async () => {
    templatesListMock.mockResolvedValue({
      items: [template(), template({ id: 't2', weekday: 3, startTime: '09:00' })],
    });
    renderPage();

    await screen.findByText('18:00');
    const lunes = screen.getByRole('heading', { name: 'Lunes' }).closest('section');
    const miercoles = screen.getByRole('heading', { name: 'Miércoles' }).closest('section');
    expect(within(lunes as HTMLElement).getByText('18:00')).toBeTruthy();
    expect(within(miercoles as HTMLElement).getByText('09:00')).toBeTruthy();
  });

  it('editar avisa la propagación RN-05 antes de guardar, y la resume después', async () => {
    templatesUpdateMock.mockResolvedValue({
      template: template({ startTime: '19:00' }),
      regeneratedSessions: 6,
      keptSessions: 2,
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    // El aviso está ANTES de tocar nada.
    expect(screen.getByText(/Las que ya tienen gente reservada quedan como están/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText(/6 clases actualizadas, 2 con anotados quedaron como estaban/),
    ).toBeTruthy();
  });

  it('crear avisa si se superpone con otra clase, sin bloquear', async () => {
    templatesCreateMock.mockResolvedValue({
      template: template({ id: 't9' }),
      details: { overlaps: ['hyrox 18:30'] },
    });
    renderPage();

    await screen.findByText('18:00');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar horario el Martes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear horario' }));

    expect(await screen.findByText(/se superpone con hyrox 18:30/)).toBeTruthy();
  });

  it('borrar muestra el desglose de lo que se fue y lo que quedó', async () => {
    templatesRemoveMock.mockResolvedValue({ deletedSessions: 5, keptSessions: 1 });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }));
    expect(screen.getByText(/Las que ya tienen gente reservada quedan en pie/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Borrar' }).at(-1) as HTMLElement);
    expect(await screen.findByText(/Quedaron 1 clases con anotados/)).toBeTruthy();
  });

  it('duplicar un día copia sus horarios al día elegido', async () => {
    templatesListMock.mockResolvedValue({
      items: [template(), template({ id: 't2', startTime: '19:00' })],
    });
    templatesCreateMock.mockResolvedValue({ template: template({ id: 'nuevo' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar Lunes' }));
    fireEvent.change(screen.getByLabelText('Copiar a'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => {
      expect(templatesCreateMock).toHaveBeenCalledTimes(2);
    });
    // Mismos horarios, otro día.
    expect(templatesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ weekday: 3, startTime: '18:00' }),
    );
    expect(templatesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ weekday: 3, startTime: '19:00' }),
    );
    expect(await screen.findByText(/2 horarios copiados/)).toBeTruthy();
  });

  it('sin horarios invita a cargar el primero', async () => {
    templatesListMock.mockResolvedValue({ items: [] });
    renderPage();
    expect(await screen.findByText('Todavía no hay horarios')).toBeTruthy();
  });
});

describe('Classes — calendario (F3-06)', () => {
  it('muestra la hora del gimnasio, no la del dispositivo', async () => {
    renderPage();
    await irAlCalendario();
    // 21:00Z con la org en AR (UTC-3) son las 18:00 para el gimnasio.
    expect(await screen.findByText('18:00')).toBeTruthy();
  });

  it('la ocupación avisa cuando la clase se está llenando', async () => {
    sessionsListMock.mockResolvedValue({
      items: [
        todaySession({ id: 'ok', bookedCount: 4 }),
        todaySession({ id: 'casi', bookedCount: 10, startsAt: todaySession().startsAt }),
        todaySession({ id: 'llena', bookedCount: 12 }),
      ],
    });
    renderPage();
    await irAlCalendario();

    expect((await screen.findByText('4/12')).className).toContain('ink-muted');
    expect(screen.getByText('10/12').className).toContain('warn');
    expect(screen.getByText('12/12').className).toContain('danger');
  });

  it('el detalle lista los anotados con la hora en que reservaron', async () => {
    renderPage();
    await irAlCalendario();

    fireEvent.click(await screen.findByText('18:00'));
    expect(await screen.findByText('Ana Fuerte')).toBeTruthy();
    expect(screen.getByText('11:30')).toBeTruthy(); // 14:30Z en AR
  });

  it('bajar el cupo por debajo de los anotados se explica en el campo', async () => {
    sessionsUpdateMock.mockRejectedValue(
      new ApiError(409, 'CAPACITY_BELOW_BOOKED', 'Ya hay 4 anotados.'),
    );
    renderPage();
    await irAlCalendario();

    fireEvent.click(await screen.findByText('18:00'));
    fireEvent.change(await screen.findByLabelText('Cupo'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Ya hay 4 anotados: el cupo no puede ser menor/)).toBeTruthy();
  });

  it('cancelar una clase con gente dice cuántos créditos vuelven', async () => {
    sessionsCancelMock.mockResolvedValue({
      session: todaySession({ status: 'cancelled', bookedCount: 0 }),
      refundedBookings: 4,
      failedRefunds: 0,
    });
    renderPage();
    await irAlCalendario();

    fireEvent.click(await screen.findByText('18:00'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar la clase' }));
    expect(screen.getByText(/Se cancelan las 4 reservas y se devuelven los créditos/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar la clase' }).at(-1) as HTMLElement);
    expect(await screen.findByText(/se devolvieron 4 créditos/)).toBeTruthy();
  });

  it('una devolución fallida no se traga: avisa que hay que revisarla', async () => {
    sessionsCancelMock.mockResolvedValue({
      session: todaySession({ status: 'cancelled' }),
      refundedBookings: 3,
      failedRefunds: 1,
    });
    renderPage();
    await irAlCalendario();

    fireEvent.click(await screen.findByText('18:00'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar la clase' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar la clase' }).at(-1) as HTMLElement);

    expect(await screen.findByText(/1 devoluciones sin hacer: revisalas a mano/)).toBeTruthy();
  });

  it('la semana se navega y vuelve a pedir el rango', async () => {
    renderPage();
    await irAlCalendario();
    const primera = sessionsListMock.mock.calls.at(-1) as [string, string];

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente →' }));
    await waitFor(() => {
      const ultima = sessionsListMock.mock.calls.at(-1) as [string, string];
      expect(ultima[0] > primera[0]).toBe(true);
    });
  });
});
