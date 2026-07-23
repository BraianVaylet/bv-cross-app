import { z } from 'zod';
import { calendarDate, email, objectIdString } from './core.js';
import { membershipStatus, role } from './enums.js';
import { cursorQuery, page } from './pagination.js';

/**
 * Contratos del módulo members — gestión de clientes del CRM (F1-08, RN-02/03).
 * memberDto es SOLO CRM: incluye adminNotes; ningún otro DTO del sistema
 * expone ese campo (docs/05-seguridad.md §4).
 */

export const memberProfile = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(30).optional(),
    emergencyContact: z.string().trim().max(120).optional(),
    birthdate: calendarDate.optional(),
  })
  .strict();

export const createMemberBody = z
  .object({
    invitedEmail: email.optional(),
    profile: memberProfile,
    adminNotes: z.string().max(2000).optional(),
  })
  .strict();

export const updateMemberBody = z
  .object({
    profile: memberProfile.partial().optional(),
    adminNotes: z.string().max(2000).optional(),
    status: z.enum(['active', 'disabled']).optional(), // sin DELETE: RN-03
    /**
     * Promover a admin o degradar a athlete (F3-11). Solo el owner puede
     * tocarlo (`org:manage-admins`) y `owner` no está en la lista: la
     * titularidad no se transfiere por PATCH.
     */
    role: z.enum(['admin', 'athlete']).optional(),
  })
  .strict();

export const membersQuery = cursorQuery
  .extend({
    status: membershipStatus.optional(),
    q: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

/** Solo CRM (adminNotes). El user vinculado aparece tras el join (F1-07). */
export const memberDto = z
  .object({
    id: objectIdString,
    role,
    status: membershipStatus,
    profile: memberProfile.partial(),
    adminNotes: z.string().optional(),
    invitedEmail: z.string().optional(),
    user: z
      .object({ id: objectIdString, name: z.string(), email: z.string() })
      .strict()
      .optional(),
    joinedAt: z.string().optional(), // ISO
    createdAt: z.string(), // ISO
  })
  .strict();

export const memberPageDto = page(memberDto);

export type MemberProfile = z.infer<typeof memberProfile>;
export type CreateMemberBody = z.infer<typeof createMemberBody>;
export type UpdateMemberBody = z.infer<typeof updateMemberBody>;
export type MembersQuery = z.infer<typeof membersQuery>;
export type MemberDto = z.infer<typeof memberDto>;
