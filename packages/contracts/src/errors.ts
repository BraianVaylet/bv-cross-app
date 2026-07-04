import { z } from 'zod';

/**
 * Catálogo de códigos de error estables (docs/03-tecnico.md §5-6).
 * Un código publicado jamás se renombra: los FEs mapean comportamiento por código.
 * El valor es el status HTTP con el que responde la API.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  WEAK_PASSWORD: 400,
  ORG_HEADER_MISSING: 400,
  TOKEN_INVALID: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  NOT_A_MEMBER: 403,
  FORBIDDEN_ROLE: 403,
  BAD_ORIGIN: 403,
  CANNOT_MODIFY_OWNER: 403,
  NOT_FOUND: 404,
  ORG_CODE_INVALID: 404,
  EMAIL_TAKEN: 409,
  ALREADY_MEMBER: 409,
  SESSION_FULL: 409,
  SESSION_CANCELLED: 409,
  SESSION_STARTED: 409,
  HAS_BOOKINGS: 409,
  NO_CREDITS: 409,
  ALREADY_BOOKED: 409,
  CANCELLATION_WINDOW_CLOSED: 409,
  PACK_IN_USE: 409,
  PACK_ARCHIVED: 409,
  TYPE_LOCKED: 409,
  LAST_ENTRY: 409,
  CAPACITY_BELOW_BOOKED: 409,
  MEMBER_DISABLED: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const errorCode = z.enum(
  Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]],
);

/** Envelope único de error de la API: { error: { code, message, details? } }. */
export const errorEnvelope = z
  .object({
    error: z
      .object({
        code: errorCode,
        message: z.string(),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

export const httpStatusFor = (code: ErrorCode): number => ERROR_CODES[code];
