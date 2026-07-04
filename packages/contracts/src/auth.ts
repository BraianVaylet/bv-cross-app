import { z } from 'zod';
import { email, objectIdString } from './core.js';
import { membershipStatus, role } from './enums.js';

/**
 * Contratos del módulo auth (docs/tasks/F1.md F1-04/05).
 * La password NO valida fortaleza acá: el servicio responde WEAK_PASSWORD
 * (código propio, distinto de VALIDATION_ERROR) usando isWeakPassword.
 */

const password = z.string().min(1).max(128);

export const registerBody = z
  .object({
    email,
    password,
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const verifyEmailBody = z.object({ token: z.string().min(1).max(128) }).strict();

export const resendVerificationBody = z.object({ email }).strict();

export const loginBody = z.object({ email, password }).strict();

/** Cara pública de un usuario — jamás hashes ni campos internos. */
export const userDto = z
  .object({
    id: objectIdString,
    email: z.string(),
    name: z.string(),
    emailVerified: z.boolean(),
  })
  .strict();

/** Resumen de membresía para el selector de org (login y /me). */
export const membershipSummaryDto = z
  .object({
    id: objectIdString,
    orgId: objectIdString,
    orgName: z.string(),
    role,
    status: membershipStatus,
  })
  .strict();

export const loginResponseDto = z
  .object({
    accessToken: z.string(),
    user: userDto,
    memberships: z.array(membershipSummaryDto),
  })
  .strict();

export type RegisterBody = z.infer<typeof registerBody>;
export type VerifyEmailBody = z.infer<typeof verifyEmailBody>;
export type ResendVerificationBody = z.infer<typeof resendVerificationBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type UserDto = z.infer<typeof userDto>;
export type MembershipSummaryDto = z.infer<typeof membershipSummaryDto>;
export type LoginResponseDto = z.infer<typeof loginResponseDto>;
