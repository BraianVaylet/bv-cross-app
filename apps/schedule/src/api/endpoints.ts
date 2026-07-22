import type {
  BookingDto,
  BookingWithSessionDto,
  BookingCreditsDto,
  CreditsDto,
  LoginResponseDto,
  MembershipSummaryDto,
  SessionDto,
  UserDto,
} from '@bv/contracts';
import { ApiError, request } from './client';

/** Superficie tipada de la API. Los DTOs vienen de @bv/contracts. */
export const api = {
  auth: {
    register: (body: { email: string; password: string; name: string }) =>
      request<{ user: UserDto }>('/api/v1/auth/register', { method: 'POST', body }),
    verifyEmail: (token: string) =>
      request<{ verified: true }>('/api/v1/auth/verify-email', { method: 'POST', body: { token } }),
    resendVerification: (email: string) =>
      request<{ sent: true }>('/api/v1/auth/resend-verification', { method: 'POST', body: { email } }),
    login: (email: string, password: string) =>
      request<LoginResponseDto>('/api/v1/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => request<undefined>('/api/v1/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ changed: true }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    forgotPassword: (email: string) =>
      request<{ sent: true }>('/api/v1/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (token: string, newPassword: string) =>
      request<{ reset: true }>('/api/v1/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword },
      }),
  },
  me: {
    get: () => request<{ user: UserDto }>('/api/v1/me'),
    update: (name: string) =>
      request<{ user: UserDto }>('/api/v1/me', { method: 'PATCH', body: { name } }),
    memberships: () => request<{ memberships: MembershipSummaryDto[] }>('/api/v1/me/memberships'),
    /** Reservas propias: `upcoming` para la home, `history` para el resto (F4-02). */
    bookings: (params: { scope?: 'upcoming' | 'history'; after?: string; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.scope) query.set('scope', params.scope);
      if (params.after) query.set('after', params.after);
      if (params.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return request<{ items: BookingWithSessionDto[]; nextCursor: string | null }>(
        `/api/v1/me/bookings${qs ? `?${qs}` : ''}`,
      );
    },
    credits: () => request<CreditsDto>('/api/v1/me/credits'),
  },
  orgs: {
    join: (code: string) =>
      request<{ membership: MembershipSummaryDto }>('/api/v1/orgs/join', {
        method: 'POST',
        body: { code },
      }),
  },
  sessions: {
    /** Grilla del gimnasio entre dos fechas de calendario (YYYY-MM-DD, tz de la org). */
    list: (from: string, to: string) =>
      request<{ items: SessionDto[] }>(`/api/v1/sessions?from=${from}&to=${to}`),
  },
  bookings: {
    /** La respuesta trae cupo y saldo nuevos: la UI no vuelve a pedir nada. */
    create: (sessionId: string) =>
      request<{
        booking: BookingDto;
        session: { id: string; bookedCount: number; capacity: number };
        credits: BookingCreditsDto;
      }>('/api/v1/bookings', { method: 'POST', body: { sessionId } }),
    cancel: (bookingId: string) =>
      request<{ refunded: boolean; credits: BookingCreditsDto | null }>(
        `/api/v1/bookings/${bookingId}/cancel`,
        { method: 'POST' },
      ),
  },
};

/** Mensaje legible para banners de error. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/** Primer error por campo desde details de VALIDATION_ERROR (path → message). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && Array.isArray(err.details)) {
    const out: Record<string, string> = {};
    for (const issue of err.details as Array<{ path?: string; message?: string }>) {
      if (issue.path && issue.message && !(issue.path in out)) out[issue.path] = issue.message;
    }
    return out;
  }
  return {};
}
