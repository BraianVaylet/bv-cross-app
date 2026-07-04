import type { Db, IndexDescription } from 'mongodb';
import { logger } from '../lib/logger.js';

/**
 * TODOS los índices del sistema, transcriptos 1:1 de docs/02-arquitectura.md §4.
 * Regla (docs/03-tecnico.md §3): toda query nueva agrega acá su índice en el mismo PR.
 */
const INDEXES: Record<string, IndexDescription[]> = {
  users: [{ key: { email: 1 }, unique: true }],

  organizations: [
    { key: { joinCode: 1 }, unique: true },
    { key: { slug: 1 }, unique: true },
  ],

  memberships: [
    // RN-02: una membresía por usuario+org. Parcial: las pre-cargas 'invited'
    // tienen userId null y no deben chocar entre sí.
    {
      key: { orgId: 1, userId: 1 },
      unique: true,
      partialFilterExpression: { userId: { $type: 'objectId' } },
    },
    { key: { userId: 1 } },
    { key: { orgId: 1, status: 1 } },
    { key: { orgId: 1, invitedEmail: 1 } },
  ],

  refreshTokens: [
    { key: { tokenHash: 1 }, unique: true },
    { key: { userId: 1 } },
    { key: { familyId: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // TTL
  ],

  exercises: [{ key: { orgId: 1, archivedAt: 1 } }, { key: { ownerUserId: 1 } }],

  rmEntries: [
    { key: { userId: 1, exerciseId: 1, date: -1 } },
    { key: { orgId: 1, exerciseId: 1, date: -1 } }, // stats CRM
  ],

  classTemplates: [{ key: { orgId: 1, active: 1 } }],

  classSessions: [
    { key: { orgId: 1, startsAt: 1 } },
    // Idempotencia del job de materialización (DEC-09). Parcial: las sesiones
    // manuales (templateId null) no deben chocar entre sí.
    {
      key: { templateId: 1, startsAt: 1 },
      unique: true,
      partialFilterExpression: { templateId: { $type: 'objectId' } },
    },
  ],

  packs: [{ key: { orgId: 1, archivedAt: 1 } }],

  packAssignments: [
    { key: { orgId: 1, userId: 1, status: 1 } },
    { key: { userId: 1, status: 1, expiresAt: 1 } }, // selección FIFO (RN-12)
    { key: { orgId: 1, status: 1, expiresAt: 1 } }, // job de expiración + alertas CRM
  ],

  bookings: [
    // RN-07: una reserva activa por sesión+usuario.
    {
      key: { sessionId: 1, userId: 1 },
      unique: true,
      partialFilterExpression: { status: 'booked' },
    },
    { key: { userId: 1, status: 1, bookedAt: -1 } },
    { key: { orgId: 1, sessionId: 1 } },
  ],

  emailTokens: [
    { key: { tokenHash: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, // TTL
  ],

  rateLimits: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }], // TTL
};

/** Idempotente: createIndexes con la misma definición no re-crea nada. */
export async function ensureIndexes(db: Db): Promise<void> {
  for (const [collection, specs] of Object.entries(INDEXES)) {
    const created = await db.collection(collection).createIndexes(specs);
    logger.debug({ collection, indexes: created }, 'indexes ensured');
  }
}

export const indexSpecs = INDEXES;
