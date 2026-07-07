import { z } from 'zod';
import { joinCode, objectIdString, timezone } from './core.js';

/**
 * Contratos del módulo orgs (docs/tasks/F1.md F1-07, RN-01/02).
 * La validez real de la timezone (IANA) la chequea el server contra
 * Intl.supportedValuesOf('timeZone'); acá solo forma.
 */

export const orgSettingsDto = z
  .object({
    cancellationWindowHours: z.number().int().min(0).max(72), // RN-08
    sessionGenerationDays: z.number().int().min(7).max(60), // RN-05
  })
  .strict();

export const createOrgBody = z
  .object({
    name: z.string().trim().min(2).max(60),
    timezone,
  })
  .strict();

export const updateOrgBody = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    timezone: timezone.optional(),
    settings: orgSettingsDto.partial().optional(),
  })
  .strict();

export const joinOrgBody = z.object({ code: joinCode }).strict();

/** joinCode solo presente para admin/owner (RN-01: el código es del gym). */
export const orgDto = z
  .object({
    id: objectIdString,
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    settings: orgSettingsDto,
    joinCode: z.string().optional(),
  })
  .strict();

export type OrgSettingsDto = z.infer<typeof orgSettingsDto>;
export type CreateOrgBody = z.infer<typeof createOrgBody>;
export type UpdateOrgBody = z.infer<typeof updateOrgBody>;
export type JoinOrgBody = z.infer<typeof joinOrgBody>;
export type OrgDto = z.infer<typeof orgDto>;
