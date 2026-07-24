import type {
  AssignmentDto,
  CreateAssignmentBody,
  CreateMemberBody,
  CreateExerciseBody,
  CreateOrgBody,
  CreatePackBody,
  CreateTemplateBody,
  LoginResponseDto,
  MemberDto,
  MembershipSummaryDto,
  ExerciseDto,
  OrgDto,
  PackDto,
  PrEntryDto,
  ProgressDto,
  TemplateDto,
  UpdateMemberBody,
  UpdateExerciseBody,
  UpdateOrgBody,
  UpdatePackBody,
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
  members: {
    list: (params: { q?: string; status?: string; after?: string; limit?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.status) query.set('status', params.status);
      if (params.after) query.set('after', params.after);
      query.set('limit', String(params.limit ?? 25));
      return request<{ items: MemberDto[]; nextCursor: string | null }>(
        `/api/v1/members?${query.toString()}`,
      );
    },
    get: (id: string) => request<{ member: MemberDto }>(`/api/v1/members/${id}`),
    create: (body: CreateMemberBody) =>
      request<{ member: MemberDto }>('/api/v1/members', { method: 'POST', body }),
    update: (id: string, body: UpdateMemberBody) =>
      request<{ member: MemberDto }>(`/api/v1/members/${id}`, { method: 'PATCH', body }),
    assignments: (id: string) =>
      request<{ items: AssignmentDto[] }>(`/api/v1/members/${id}/assignments`),
    assign: (id: string, body: CreateAssignmentBody) =>
      request<{ assignment: AssignmentDto }>(`/api/v1/members/${id}/assignments`, {
        method: 'POST',
        body,
      }),
  },
  assignments: {
    cancel: (id: string, reason: string) =>
      request<{ assignment: AssignmentDto }>(`/api/v1/assignments/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
  },
  exercises: {
    // scope 'org' = catálogo del gimnasio. Con includeArchived el admin ve
    // también los archivados (RN-19).
    list: (includeArchived = false) =>
      request<{ items: ExerciseDto[] }>(
        `/api/v1/exercises?scope=org${includeArchived ? '&includeArchived=1' : ''}`,
      ),
    create: (body: CreateExerciseBody) =>
      request<{ exercise: ExerciseDto }>('/api/v1/exercises', { method: 'POST', body }),
    update: (id: string, body: UpdateExerciseBody) =>
      request<{ exercise: ExerciseDto }>(`/api/v1/exercises/${id}`, { method: 'PATCH', body }),
    archive: (id: string, archived: boolean) =>
      request<{ exercise: ExerciseDto }>(
        `/api/v1/exercises/${id}/${archived ? 'archive' : 'restore'}`,
        { method: 'POST' },
      ),
  },
  templates: {
    list: () => request<{ items: TemplateDto[] }>('/api/v1/templates'),
    create: (body: CreateTemplateBody) =>
      request<{ template: TemplateDto }>('/api/v1/templates', { method: 'POST', body }),
  },
  stats: {
    /** Ejercicios del catálogo sobre los que este cliente ya cargó algo. */
    memberExercises: (memberId: string) =>
      request<{ items: ExerciseDto[] }>(`/api/v1/stats/members/${memberId}/exercises`),
    memberProgress: (memberId: string, exerciseId: string) =>
      request<{ progress: ProgressDto }>(
        `/api/v1/stats/members/${memberId}/progress?exerciseId=${exerciseId}`,
      ),
    prsFeed: (limit = 20) =>
      request<{ items: PrEntryDto[] }>(`/api/v1/stats/prs-feed?limit=${String(limit)}`),
  },
  packs: {
    list: (includeArchived = false) =>
      request<{ items: PackDto[] }>(`/api/v1/packs${includeArchived ? '?includeArchived=1' : ''}`),
    create: (body: CreatePackBody) =>
      request<{ pack: PackDto }>('/api/v1/packs', { method: 'POST', body }),
    update: (id: string, body: UpdatePackBody) =>
      request<{ pack: PackDto }>(`/api/v1/packs/${id}`, { method: 'PATCH', body }),
    archive: (id: string) =>
      request<{ pack: PackDto }>(`/api/v1/packs/${id}/archive`, { method: 'POST' }),
    restore: (id: string) =>
      request<{ pack: PackDto }>(`/api/v1/packs/${id}/restore`, { method: 'POST' }),
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
