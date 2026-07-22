import type {
  CreateOrgBody,
  CreatePackBody,
  CreateTemplateBody,
  LoginResponseDto,
  MembershipSummaryDto,
  OrgDto,
  PackDto,
  TemplateDto,
  UpdateOrgBody,
  UserDto,
} from '@bv/contracts';
import { ApiError, request } from './client';

/** Superficie tipada de la API para el CRM. Los DTOs vienen de @bv/contracts. */
export const api = {
  auth: {
    register: (body: { email: string; password: string; name: string }) =>
      request<{ user: UserDto }>('/api/v1/auth/register', { method: 'POST', body }),
    verifyEmail: (token: string) =>
      request<{ verified: true }>('/api/v1/auth/verify-email', { method: 'POST', body: { token } }),
    resendVerification: (email: string) =>
      request<{ sent: true }>('/api/v1/auth/resend-verification', {
        method: 'POST',
        body: { email },
      }),
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
  },
  orgs: {
    // Devuelve solo la org: la membresía de owner se crea del lado del
    // servidor y se lee con `me.memberships()`.
    create: (body: CreateOrgBody) =>
      request<{ org: OrgDto }>('/api/v1/orgs', { method: 'POST', body }),
    current: () => request<{ org: OrgDto }>('/api/v1/orgs/current'),
    update: (body: UpdateOrgBody) =>
      request<{ org: OrgDto }>('/api/v1/orgs/current', { method: 'PATCH', body }),
    regenerateCode: () =>
      request<{ org: OrgDto }>('/api/v1/orgs/current/regenerate-code', { method: 'POST' }),
    join: (code: string) =>
      request<{ membership: MembershipSummaryDto }>('/api/v1/orgs/join', {
        method: 'POST',
        body: { code },
      }),
  },
  templates: {
    list: () => request<{ items: TemplateDto[] }>('/api/v1/templates'),
    create: (body: CreateTemplateBody) =>
      request<{ template: TemplateDto }>('/api/v1/templates', { method: 'POST', body }),
  },
  packs: {
    list: () => request<{ items: PackDto[] }>('/api/v1/packs'),
    create: (body: CreatePackBody) =>
      request<{ pack: PackDto }>('/api/v1/packs', { method: 'POST', body }),
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
