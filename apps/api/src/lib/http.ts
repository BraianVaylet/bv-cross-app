import type { Context } from 'hono';
import type { z } from 'zod';
import { DomainError } from './errors.js';

function flatten(issues: z.ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Parsea y valida el body JSON contra un schema de @bv/contracts. */
export async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_ERROR', 'Datos inválidos.', flatten(parsed.error.issues));
  }
  return parsed.data as z.infer<T>;
}

/** Parsea y valida los query params contra un schema. */
export function parseQuery<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new DomainError('VALIDATION_ERROR', 'Parámetros inválidos.', flatten(parsed.error.issues));
  }
  return parsed.data as z.infer<T>;
}
