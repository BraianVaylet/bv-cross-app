import type {
  AttendeeDto,
  CreateSessionBody,
  CreateTemplateBody,
  SessionDto,
  SessionsQuery,
  TemplateDto,
  UpdateSessionBody,
  UpdateTemplateBody,
} from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import { organizations } from '../../db/collections.js';
import type { ClassSessionDoc, ClassTemplateDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import { addDaysYmd, datesBetween, localToUtc, todayInTz, weekdayInTz } from '../../lib/schedule-time.js';
import { cancelSessionByGym } from '../bookings/booking-service.js';
import {
  deleteSessions,
  deleteTemplate,
  findSession,
  findTemplate,
  futureSessionsOfTemplate,
  insertSession,
  insertTemplate,
  listActiveTemplatesOfDay,
  listAttendees,
  listSessionsInRange,
  listTemplates,
  myBookingsFor,
  updateSession,
  updateTemplate,
} from './schedule.repo.js';

type OrgContext = AppVariables['org'];

const MAX_RANGE_DAYS = 31;

function toTemplateDto(doc: ClassTemplateDoc): TemplateDto {
  return {
    id: doc._id.toHexString(),
    weekday: doc.weekday,
    startTime: doc.startTime,
    durationMin: doc.durationMin,
    discipline: doc.discipline,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
    capacity: doc.capacity,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toSessionDto(doc: ClassSessionDoc, myBookingId: ObjectId | null): SessionDto {
  return {
    id: doc._id.toHexString(),
    templateId: doc.templateId ? doc.templateId.toHexString() : null,
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    discipline: doc.discipline,
    ...(doc.description !== undefined ? { description: doc.description } : {}),
    capacity: doc.capacity,
    bookedCount: doc.bookedCount,
    status: doc.status,
    myBookingId: myBookingId ? myBookingId.toHexString() : null,
  };
}

const minutesOf = (hm: string): number => {
  const [h, m] = hm.split(':');
  return Number(h) * 60 + Number(m);
};

/** Timezone y horizonte de generación de la org (se leen en cada operación). */
async function orgSettings(orgId: ObjectId): Promise<{ timezone: string; generationDays: number }> {
  const doc = await organizations().findOne({ _id: orgId });
  if (!doc) throw new DomainError('NOT_FOUND', 'La organización no existe.');
  return { timezone: doc.timezone, generationDays: doc.settings.sessionGenerationDays };
}

/**
 * Solapamientos con otros templates activos del mismo día. NO bloquea: hay
 * gimnasios con clases en paralelo; el CRM lo muestra como advertencia.
 */
async function overlapsFor(
  orgId: ObjectId,
  weekday: number,
  startTime: string,
  durationMin: number,
  excludeId?: ObjectId,
): Promise<string[]> {
  const others = await listActiveTemplatesOfDay(orgId, weekday, excludeId);
  const start = minutesOf(startTime);
  const end = start + durationMin;
  return others
    .filter((o) => {
      const oStart = minutesOf(o.startTime);
      return start < oStart + o.durationMin && oStart < end;
    })
    .map((o) => `${o.discipline} ${o.startTime}`);
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplatesForOrg(org: OrgContext): Promise<TemplateDto[]> {
  const docs = await listTemplates(new ObjectId(org.orgId));
  return docs.map(toTemplateDto);
}

export async function createTemplate(
  org: OrgContext,
  body: CreateTemplateBody,
): Promise<{ template: TemplateDto; overlaps: string[] }> {
  const orgId = new ObjectId(org.orgId);
  const now = new Date();
  const doc: ClassTemplateDoc = {
    _id: new ObjectId(),
    orgId,
    weekday: body.weekday,
    startTime: body.startTime,
    durationMin: body.durationMin,
    discipline: body.discipline,
    ...(body.description !== undefined ? { description: body.description } : {}),
    capacity: body.capacity,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const overlaps = await overlapsFor(orgId, body.weekday, body.startTime, body.durationMin);
  await insertTemplate(doc);
  // Materializa ya, sin esperar a la corrida horaria del job.
  await materializeTemplate(orgId, doc, now);
  return { template: toTemplateDto(doc), overlaps };
}

/**
 * PATCH con propagación (RN-05): las sesiones futuras SIN reservas se
 * regeneran con los datos nuevos; las que ya tienen anotados quedan como
 * están (el admin las ajusta una por una si quiere).
 */
export async function patchTemplate(
  org: OrgContext,
  templateId: string,
  body: UpdateTemplateBody,
): Promise<{ template: TemplateDto; overlaps: string[]; regeneratedSessions: number; keptSessions: number }> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(templateId);
  const current = await findTemplate(orgId, id);
  if (!current) throw new DomainError('NOT_FOUND', 'La plantilla no existe.');

  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const key of ['weekday', 'startTime', 'durationMin', 'discipline', 'capacity', 'active'] as const) {
    const value = body[key];
    if (value !== undefined) set[key] = value;
  }
  if (body.description !== undefined) {
    if (body.description === null) unset.push('description');
    else set.description = body.description;
  }

  const updated = Object.keys(set).length > 0 || unset.length > 0
    ? await updateTemplate(orgId, id, set, unset)
    : current;
  if (!updated) throw new DomainError('NOT_FOUND', 'La plantilla no existe.');

  const now = new Date();
  const { free, booked } = await futureSessionsOfTemplate(orgId, id, now);
  await deleteSessions(orgId, free.map((s) => s._id));
  const regenerated = updated.active ? await materializeTemplate(orgId, updated, now) : 0;

  const overlaps = await overlapsFor(
    orgId,
    updated.weekday,
    updated.startTime,
    updated.durationMin,
    id,
  );
  return {
    template: toTemplateDto(updated),
    overlaps,
    regeneratedSessions: regenerated,
    keptSessions: booked.length,
  };
}

/**
 * Borrado: se van el template y sus sesiones futuras sin reservas. Las que
 * tienen anotados quedan (con `templateId` huérfano) y se administran a mano.
 */
export async function removeTemplate(
  org: OrgContext,
  templateId: string,
): Promise<{ deletedSessions: number; keptSessions: number }> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(templateId);
  const current = await findTemplate(orgId, id);
  if (!current) throw new DomainError('NOT_FOUND', 'La plantilla no existe.');

  const { free, booked } = await futureSessionsOfTemplate(orgId, id, new Date());
  const deletedSessions = await deleteSessions(orgId, free.map((s) => s._id));
  await deleteTemplate(orgId, id);
  return { deletedSessions, keptSessions: booked.length };
}

/**
 * Crea las sesiones faltantes de un template hasta el horizonte de la org.
 * Idempotente: el índice único {templateId, startsAt} descarta los duplicados,
 * así que el job puede correr N veces (o en N réplicas) sin ensuciar (DEC-09).
 * Devuelve cuántas se insertaron.
 */
export async function materializeTemplate(
  orgId: ObjectId,
  template: ClassTemplateDoc,
  now: Date,
): Promise<number> {
  const { timezone, generationDays } = await orgSettings(orgId);
  const today = todayInTz(timezone, now);
  const horizon = addDaysYmd(today, generationDays);

  let created = 0;
  for (const date of datesBetween(today, horizon)) {
    if (weekdayInTz(date, timezone) !== template.weekday) continue;
    const startsAt = localToUtc(date, template.startTime, timezone);
    if (startsAt <= now) continue; // nunca se crean sesiones ya empezadas
    const doc: ClassSessionDoc = {
      _id: new ObjectId(),
      orgId,
      templateId: template._id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + template.durationMin * 60_000),
      // DEC-07: la sesión COPIA los datos; editarla no toca el template.
      discipline: template.discipline,
      ...(template.description !== undefined ? { description: template.description } : {}),
      capacity: template.capacity,
      bookedCount: 0,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    };
    try {
      await insertSession(doc);
      created += 1;
    } catch (err) {
      // E11000 del índice único: la sesión ya existía → idempotencia.
      if (!(err instanceof Error && err.message.includes('E11000'))) throw err;
    }
  }
  return created;
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

export async function listSessions(
  org: OrgContext,
  userId: string,
  query: SessionsQuery,
): Promise<SessionDto[]> {
  const orgId = new ObjectId(org.orgId);
  const { timezone } = await orgSettings(orgId);

  const days = datesBetween(query.from, query.to).length;
  if (query.to < query.from) throw new DomainError('VALIDATION_ERROR', 'El rango termina antes de empezar.');
  if (days > MAX_RANGE_DAYS) {
    throw new DomainError('VALIDATION_ERROR', `El rango no puede superar ${MAX_RANGE_DAYS} días.`);
  }

  // [from 00:00 local, to+1 00:00 local) — el rango se interpreta en tz de la org.
  const fromUtc = localToUtc(query.from, '00:00', timezone);
  const toUtc = localToUtc(addDaysYmd(query.to, 1), '00:00', timezone);

  const docs = await listSessionsInRange(orgId, fromUtc, toUtc);
  const mine = await myBookingsFor(new ObjectId(userId), docs.map((s) => s._id));
  return docs.map((s) => toSessionDto(s, mine.get(s._id.toHexString()) ?? null));
}

export async function createManualSession(
  org: OrgContext,
  body: CreateSessionBody,
): Promise<SessionDto> {
  const orgId = new ObjectId(org.orgId);
  const { timezone } = await orgSettings(orgId);
  const now = new Date();
  const startsAt = localToUtc(body.date, body.startTime, timezone);
  const doc: ClassSessionDoc = {
    _id: new ObjectId(),
    orgId,
    templateId: null, // manual: no la toca la materialización
    startsAt,
    endsAt: new Date(startsAt.getTime() + body.durationMin * 60_000),
    discipline: body.discipline,
    ...(body.description !== undefined ? { description: body.description } : {}),
    capacity: body.capacity,
    bookedCount: 0,
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  };
  await insertSession(doc);
  return toSessionDto(doc, null);
}

export async function patchSession(
  org: OrgContext,
  sessionId: string,
  body: UpdateSessionBody,
): Promise<SessionDto> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(sessionId);
  const current = await findSession(orgId, id);
  if (!current) throw new DomainError('NOT_FOUND', 'La sesión no existe.');

  if (body.capacity !== undefined && body.capacity < current.bookedCount) {
    throw new DomainError(
      'CAPACITY_BELOW_BOOKED',
      `Ya hay ${current.bookedCount} anotados: el cupo no puede ser menor.`,
    );
  }

  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  if (body.capacity !== undefined) set.capacity = body.capacity;
  if (body.description !== undefined) {
    if (body.description === null) unset.push('description');
    else set.description = body.description;
  }
  const updated = Object.keys(set).length > 0 || unset.length > 0
    ? await updateSession(orgId, id, set, unset)
    : current;
  if (!updated) throw new DomainError('NOT_FOUND', 'La sesión no existe.');
  return toSessionDto(updated, null);
}

/**
 * Cancelación (RN-09): delega en el booking-service, que cancela las reservas
 * y devuelve los créditos en transacción (F4-01). `failedRefunds > 0` no
 * invalida la cancelación — la sesión queda cancelada y el CRM muestra cuántas
 * devoluciones hay que revisar a mano.
 */
export async function cancelSession(
  org: OrgContext,
  sessionId: string,
  actorUserId: string,
): Promise<{ session: SessionDto; refundedBookings: number; failedRefunds: number }> {
  const { session, cancelled, failed } = await cancelSessionByGym(
    new ObjectId(org.orgId),
    new ObjectId(sessionId),
    new ObjectId(actorUserId),
  );
  return { session: toSessionDto(session, null), refundedBookings: cancelled, failedRefunds: failed };
}

export async function sessionAttendees(org: OrgContext, sessionId: string): Promise<AttendeeDto[]> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(sessionId);
  const session = await findSession(orgId, id);
  if (!session) throw new DomainError('NOT_FOUND', 'La sesión no existe.');
  const rows = await listAttendees(id);
  return rows.map((r) => ({
    bookingId: r.bookingId.toHexString(),
    userId: r.userId.toHexString(),
    name: r.name,
    bookedAt: r.bookedAt.toISOString(),
  }));
}
