import { z } from 'zod';
import { calendarDate, objectIdString } from './core.js';
import { exerciseType } from './enums.js';

/**
 * Contratos del módulo stats (F3-09, primeros endpoints).
 * Todo lo de acá es admin-only y siempre org-scoped: son datos de los
 * clientes del gimnasio (docs/05-seguridad.md §2).
 */

export const progressQuery = z.object({ exerciseId: objectIdString }).strict();

/** Un punto del gráfico de progreso. */
export const progressPointDto = z
  .object({
    id: objectIdString,
    /** kg o reps, según el tipo del ejercicio (RN-23). */
    value: z.number(),
    date: calendarDate,
    comment: z.string().optional(),
    painFlag: z.boolean().optional(),
    /** Superó todas las marcas anteriores (definición de PR, F3-09). */
    isPr: z.boolean(),
  })
  .strict();

export const progressDto = z
  .object({
    exerciseId: objectIdString,
    exerciseName: z.string(),
    type: exerciseType,
    /** Cronológico ascendente: el gráfico lo dibuja tal cual. */
    points: z.array(progressPointDto),
    /**
     * RN-22: el vigente es el de FECHA más reciente, no el mayor valor.
     * `null` si el cliente todavía no cargó nada de este ejercicio.
     */
    currentRm: z.number().nullable(),
    /** El mejor histórico, que puede no ser el vigente. */
    best: z.number().nullable(),
  })
  .strict();

export const prsFeedQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

export const prEntryDto = z
  .object({
    id: objectIdString,
    userId: objectIdString,
    userName: z.string(),
    exerciseId: objectIdString,
    exerciseName: z.string(),
    type: exerciseType,
    value: z.number(),
    /** Cuánto superó la marca anterior; `null` si fue su primera carga. */
    improvement: z.number().nullable(),
    date: calendarDate,
  })
  .strict();

/**
 * Dashboard del CRM (F3-10): una sola llamada con todo lo que se mira al abrir
 * el día. Cada bloque responde una pregunta concreta del dueño del box, y por
 * eso viajan juntos: son seis preguntas que se hacen al mismo tiempo.
 */

/** Una clase de hoy, para la lista de ocupación. */
export const dashboardSessionDto = z
  .object({
    id: objectIdString,
    startsAt: z.string(), // ISO UTC — el FE lo muestra en la tz de la org
    discipline: z.string(),
    bookedCount: z.number(),
    capacity: z.number(),
  })
  .strict();

/** Una asignación por vencer: a quién avisarle y cuánto le queda sin usar. */
export const dashboardExpiringDto = z
  .object({
    assignmentId: objectIdString,
    membershipId: objectIdString,
    memberName: z.string(),
    packName: z.string(),
    expiresAt: z.string(), // ISO
    /** Días de calendario hasta el vencimiento, en la tz de la org. 0 = hoy. */
    daysLeft: z.number(),
    remaining: z.number(),
  })
  .strict();

/** Alguien que dejó de venir. Es la lista para levantar el teléfono. */
export const dashboardInactiveDto = z
  .object({
    membershipId: objectIdString,
    memberName: z.string(),
    /** `null` = nunca reservó desde que se dio de alta. */
    lastBookingAt: z.string().nullable(),
    /** Días desde la última reserva; si nunca reservó, desde el alta. */
    daysInactive: z.number(),
  })
  .strict();

export const dashboardDto = z
  .object({
    /** Fecha de hoy en la tz de la org: el FE la muestra sin recalcular. */
    today: z
      .object({
        date: calendarDate,
        sessions: z.array(dashboardSessionDto),
      })
      .strict(),
    /** Semana en curso (lunes a domingo, tz de la org). */
    week: z
      .object({
        from: calendarDate,
        to: calendarDate,
        bookings: z.number(),
        cancellations: z.number(),
      })
      .strict(),
    expiringAssignments: z.array(dashboardExpiringDto),
    inactiveMembers: z.array(dashboardInactiveDto),
    /** Mes calendario en curso, en la tz de la org. */
    month: z
      .object({
        from: calendarDate,
        to: calendarDate,
        /** Suma de `payment.amount` de las asignaciones creadas en el mes. */
        revenue: z.number(),
        /** Membresías activadas en el mes (`joinedAt`). */
        newMembers: z.number(),
      })
      .strict(),
  })
  .strict();

export type DashboardSessionDto = z.infer<typeof dashboardSessionDto>;
export type DashboardExpiringDto = z.infer<typeof dashboardExpiringDto>;
export type DashboardInactiveDto = z.infer<typeof dashboardInactiveDto>;
export type DashboardDto = z.infer<typeof dashboardDto>;

export type ProgressQuery = z.infer<typeof progressQuery>;
export type ProgressPointDto = z.infer<typeof progressPointDto>;
export type ProgressDto = z.infer<typeof progressDto>;
export type PrsFeedQuery = z.infer<typeof prsFeedQuery>;
export type PrEntryDto = z.infer<typeof prEntryDto>;
