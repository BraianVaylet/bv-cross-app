import { z } from 'zod';
import { calendarDate, objectIdString } from './core.js';
import { sessionStatus } from './enums.js';

/**
 * Contratos del módulo schedule (F3-01, RN-05/09/10 · DEC-07/08).
 * Los templates guardan hora LOCAL de la org (`HH:mm` + weekday); las
 * sesiones materializadas viajan siempre en UTC ISO (Arquitectura §7).
 */

/** Hora local del gimnasio, 24 h. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'se espera HH:mm');

const weekday = z.number().int().min(0).max(6); // 0 = domingo, en tz de la org
const durationMin = z.number().int().min(15).max(240);
const capacity = z.number().int().min(1).max(100);
const discipline = z.string().trim().min(1).max(40);
const description = z.string().trim().max(200);

export const createTemplateBody = z
  .object({
    weekday,
    startTime: timeOfDay,
    durationMin,
    discipline,
    description: description.optional(),
    capacity,
  })
  .strict();

export const updateTemplateBody = z
  .object({
    weekday: weekday.optional(),
    startTime: timeOfDay.optional(),
    durationMin: durationMin.optional(),
    discipline: discipline.optional(),
    description: description.nullable().optional(),
    capacity: capacity.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const templateDto = z
  .object({
    id: objectIdString,
    weekday,
    startTime: timeOfDay,
    durationMin: z.number(),
    discipline: z.string(),
    description: z.string().optional(),
    capacity: z.number(),
    active: z.boolean(),
    createdAt: z.string(), // ISO
    updatedAt: z.string(), // ISO
  })
  .strict();

/** Sesión manual: fecha de calendario + hora local (se convierte a UTC en el server). */
export const createSessionBody = z
  .object({
    date: calendarDate,
    startTime: timeOfDay,
    durationMin,
    discipline,
    description: description.optional(),
    capacity,
  })
  .strict();

export const updateSessionBody = z
  .object({
    capacity: capacity.optional(),
    description: description.nullable().optional(),
  })
  .strict();

/** Rango de la grilla: máximo 31 días (el CRM pide semanas o un mes). */
export const sessionsQuery = z.object({ from: calendarDate, to: calendarDate }).strict();

export const sessionDto = z
  .object({
    id: objectIdString,
    templateId: objectIdString.nullable(),
    startsAt: z.string(), // ISO UTC
    endsAt: z.string(), // ISO UTC
    discipline: z.string(),
    description: z.string().optional(),
    capacity: z.number(),
    bookedCount: z.number(),
    status: sessionStatus,
    /** Reserva propia del caller en esta sesión, si tiene una activa. */
    myBookingId: objectIdString.nullable(),
  })
  .strict();

export const attendeeDto = z
  .object({
    bookingId: objectIdString,
    userId: objectIdString,
    name: z.string(),
    bookedAt: z.string(), // ISO
  })
  .strict();

export type CreateTemplateBody = z.infer<typeof createTemplateBody>;
export type UpdateTemplateBody = z.infer<typeof updateTemplateBody>;
export type TemplateDto = z.infer<typeof templateDto>;
export type CreateSessionBody = z.infer<typeof createSessionBody>;
export type UpdateSessionBody = z.infer<typeof updateSessionBody>;
export type SessionsQuery = z.infer<typeof sessionsQuery>;
export type SessionDto = z.infer<typeof sessionDto>;
export type AttendeeDto = z.infer<typeof attendeeDto>;
