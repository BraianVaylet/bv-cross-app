import { z } from 'zod';

/** ObjectId de Mongo serializado: 24 caracteres hexadecimales. */
export const objectIdString = z.string().regex(/^[0-9a-f]{24}$/i, 'id inválido');

/** Instante UTC serializado ISO-8601 con sufijo Z (docs/02-arquitectura.md §7). */
export const isoDateString = z.string().datetime({ offset: false });

/**
 * Fecha "de calendario" sin hora (YYYY-MM-DD), p. ej. la fecha de un RM.
 * Valida rangos reales: 2026-02-30 se rechaza.
 */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato esperado YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'fecha inexistente');

/** Email normalizado: trim + lowercase. Máximo RFC práctico 254. */
export const email = z.string().trim().toLowerCase().email().max(254);

/** Código de organización (RN-01): [a-z0-9-]{4,32}, se normaliza a lowercase. */
export const joinCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{4,32}$/, 'código inválido');

/** Timezone IANA (validación completa contra Intl la hace el server). */
export const timezone = z.string().min(1).max(64);
