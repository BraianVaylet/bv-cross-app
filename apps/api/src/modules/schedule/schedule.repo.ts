import type { ObjectId } from 'mongodb';
import { bookings, classSessions, classTemplates, organizations, users } from '../../db/collections.js';
import type { ClassSessionDoc, ClassTemplateDoc } from '../../db/types.js';

/**
 * Queries de schedule. TODAS filtran por orgId (docs/05-seguridad.md §2):
 * buscar una sesión o template por _id sin orgId es un bug de seguridad
 * aunque tenantGuard ya haya validado la membresía.
 */

// ── Templates ────────────────────────────────────────────────────────────────

/** Activos primero, después por weekday y hora (orden de la grilla del CRM). */
export function listTemplates(orgId: ObjectId): Promise<ClassTemplateDoc[]> {
  return classTemplates()
    .find({ orgId })
    .sort({ active: -1, weekday: 1, startTime: 1 })
    .toArray();
}

export function findTemplate(orgId: ObjectId, id: ObjectId): Promise<ClassTemplateDoc | null> {
  return classTemplates().findOne({ orgId, _id: id });
}

/** Templates activos del mismo weekday, para detectar solapamientos. */
export function listActiveTemplatesOfDay(
  orgId: ObjectId,
  weekday: number,
  excludeId?: ObjectId,
): Promise<ClassTemplateDoc[]> {
  return classTemplates()
    .find({ orgId, weekday, active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .toArray();
}

export async function insertTemplate(doc: ClassTemplateDoc): Promise<void> {
  await classTemplates().insertOne(doc);
}

export function updateTemplate(
  orgId: ObjectId,
  id: ObjectId,
  set: Record<string, unknown>,
  unset: string[] = [],
): Promise<ClassTemplateDoc | null> {
  return classTemplates().findOneAndUpdate(
    { orgId, _id: id },
    {
      $set: { ...set, updatedAt: new Date() },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
    },
    { returnDocument: 'after' },
  );
}

export async function deleteTemplate(orgId: ObjectId, id: ObjectId): Promise<boolean> {
  const res = await classTemplates().deleteOne({ orgId, _id: id });
  return res.deletedCount === 1;
}

/** Templates activos de todas las orgs activas, para el job de materialización. */
export function listActiveTemplatesForJob(orgId: ObjectId): Promise<ClassTemplateDoc[]> {
  return classTemplates().find({ orgId, active: true }).toArray();
}

export function listActiveOrgs(): Promise<
  { _id: ObjectId; timezone: string; sessionGenerationDays: number }[]
> {
  return organizations()
    .find({ status: 'active' })
    .project<{ _id: ObjectId; timezone: string; settings: { sessionGenerationDays: number } }>({
      timezone: 1,
      'settings.sessionGenerationDays': 1,
    })
    .toArray()
    .then((docs) =>
      docs.map((d) => ({
        _id: d._id,
        timezone: d.timezone,
        sessionGenerationDays: d.settings.sessionGenerationDays,
      })),
    );
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

export function listSessionsInRange(
  orgId: ObjectId,
  fromUtc: Date,
  toUtc: Date,
): Promise<ClassSessionDoc[]> {
  return classSessions()
    .find({ orgId, startsAt: { $gte: fromUtc, $lt: toUtc } })
    .sort({ startsAt: 1 })
    .toArray();
}

export function findSession(orgId: ObjectId, id: ObjectId): Promise<ClassSessionDoc | null> {
  return classSessions().findOne({ orgId, _id: id });
}

export async function insertSession(doc: ClassSessionDoc): Promise<void> {
  await classSessions().insertOne(doc);
}

export function updateSession(
  orgId: ObjectId,
  id: ObjectId,
  set: Record<string, unknown>,
  unset: string[] = [],
): Promise<ClassSessionDoc | null> {
  return classSessions().findOneAndUpdate(
    { orgId, _id: id },
    {
      $set: { ...set, updatedAt: new Date() },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map((k) => [k, ''])) } : {}),
    },
    { returnDocument: 'after' },
  );
}

/** Sesiones futuras de un template, separadas por si tienen reservas (RN-05). */
export async function futureSessionsOfTemplate(
  orgId: ObjectId,
  templateId: ObjectId,
  now: Date,
): Promise<{ free: ClassSessionDoc[]; booked: ClassSessionDoc[] }> {
  const docs = await classSessions()
    .find({ orgId, templateId, startsAt: { $gt: now } })
    .toArray();
  return {
    free: docs.filter((s) => s.bookedCount === 0),
    booked: docs.filter((s) => s.bookedCount > 0),
  };
}

export async function deleteSessions(orgId: ObjectId, ids: ObjectId[]): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await classSessions().deleteMany({ orgId, _id: { $in: ids } });
  return res.deletedCount;
}

/** Reservas activas del caller en un conjunto de sesiones (para `myBookingId`). */
export async function myBookingsFor(
  userId: ObjectId,
  sessionIds: ObjectId[],
): Promise<Map<string, ObjectId>> {
  if (sessionIds.length === 0) return new Map();
  const docs = await bookings()
    .find({ userId, sessionId: { $in: sessionIds }, status: 'booked' })
    .project<{ _id: ObjectId; sessionId: ObjectId }>({ sessionId: 1 })
    .toArray();
  return new Map(docs.map((b) => [b.sessionId.toHexString(), b._id]));
}

export interface AttendeeRow {
  bookingId: ObjectId;
  userId: ObjectId;
  name: string;
  bookedAt: Date;
}

/** Anotados de una sesión: reservas `booked` con el nombre del usuario. */
export async function listAttendees(sessionId: ObjectId): Promise<AttendeeRow[]> {
  const docs = await bookings()
    .find({ sessionId, status: 'booked' })
    .sort({ bookedAt: 1 })
    .toArray();
  if (docs.length === 0) return [];
  const userDocs = await users()
    .find({ _id: { $in: docs.map((b) => b.userId) } })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray();
  const names = new Map(userDocs.map((u) => [u._id.toHexString(), u.name]));
  return docs.map((b) => ({
    bookingId: b._id,
    userId: b.userId,
    name: names.get(b.userId.toHexString()) ?? '(sin nombre)',
    bookedAt: b.bookedAt,
  }));
}
