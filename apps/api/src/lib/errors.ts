import { httpStatusFor, type ErrorCode } from '@bv/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from './logger.js';

/**
 * Error de dominio (docs/03-tecnico.md §6): código estable del catálogo de
 * @bv/contracts + mensaje en español apto para el usuario final.
 * El status HTTP sale del catálogo — acá no se decide.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return httpStatusFor(this.code);
  }
}

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

/** Único punto de traducción error → HTTP. Stack solo al log, nunca al cliente. */
export function onError(err: Error, c: Context): Response {
  if (err instanceof DomainError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status as ContentfulStatusCode);
  }
  logger.error({ err, requestId: c.get('requestId') as string | undefined }, 'unhandled error');
  return c.json(errorBody('INTERNAL', 'Ocurrió un error inesperado.'), 500);
}
