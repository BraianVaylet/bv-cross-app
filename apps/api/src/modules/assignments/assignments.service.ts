import type { AssignmentDto, AssignmentsQuery, CreateAssignmentBody } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import { organizations } from '../../db/collections.js';
import type { PackAssignmentDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import { addDaysYmd, endOfDayInTz, todayInTz } from '../../lib/schedule-time.js';
import { findPack } from '../packs/packs.repo.js';
import {
  findAssignment,
  findMembership,
  insertAssignment,
  listAssignments,
  updateAssignment,
} from './assignments.repo.js';

type OrgContext = AppVariables['org'];

const MAX_START_OFFSET_DAYS = 365; // ±1 año: ataja typos de fecha

function toDto(doc: PackAssignmentDoc): AssignmentDto {
  return {
    id: doc._id.toHexString(),
    packId: doc.packId.toHexString(),
    userId: doc.userId.toHexString(),
    snapshot: doc.snapshot,
    startsAt: doc.startsAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    classesUsed: doc.classesUsed,
    remaining: doc.snapshot.classCount - doc.classesUsed,
    status: doc.status,
    payment: {
      amount: doc.payment.amount,
      method: doc.payment.method,
      paidAt: doc.payment.paidAt.toISOString(),
      ...(doc.payment.notes !== undefined ? { notes: doc.payment.notes } : {}),
    },
    ...(doc.cancelledReason !== undefined ? { cancelledReason: doc.cancelledReason } : {}),
    createdAt: doc.createdAt.toISOString(),
  };
}

async function orgTimezone(orgId: ObjectId): Promise<string> {
  const doc = await organizations().findOne({ _id: orgId }, { projection: { timezone: 1 } });
  if (!doc) throw new DomainError('NOT_FOUND', 'La organización no existe.');
  return doc.timezone;
}

/**
 * Crea la asignación: el "saldo" del atleta.
 *
 * Vencimiento (RN-18): `expiresAt` = fin del día (23:59:59.999 en la tz del
 * gimnasio) de `startsAt + durationDays`. La vigencia incluye el día de inicio
 * completo y termina `durationDays` días después — decisión generosa a favor
 * del cliente, tomada en RN-18.
 */
export async function createAssignment(
  org: OrgContext,
  membershipId: string,
  body: CreateAssignmentBody,
): Promise<AssignmentDto> {
  const orgId = new ObjectId(org.orgId);

  const membership = await findMembership(orgId, new ObjectId(membershipId));
  if (!membership) throw new DomainError('NOT_FOUND', 'Cliente inexistente.');
  if (membership.status === 'disabled') {
    throw new DomainError('MEMBER_DISABLED', 'El cliente está deshabilitado.');
  }
  // `invited` SÍ puede recibir packs: el gimnasio carga todo antes de que el
  // atleta se registre (la ficha se vincula al hacer join, F1-07).
  if (!membership.userId) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'La ficha todavía no tiene cuenta vinculada: el cliente debe registrarse con el código del gimnasio.',
    );
  }

  const pack = await findPack(orgId, new ObjectId(body.packId));
  if (!pack) throw new DomainError('NOT_FOUND', 'El pack no existe.');
  if (pack.archivedAt) {
    throw new DomainError('PACK_ARCHIVED', 'El pack está archivado: no se puede asignar.');
  }

  const timezone = await orgTimezone(orgId);
  const now = new Date();
  const today = todayInTz(timezone, now);
  const startsYmd = body.startsAt ?? today;

  const offsetDays = Math.round(
    (Date.parse(`${startsYmd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (Math.abs(offsetDays) > MAX_START_OFFSET_DAYS) {
    throw new DomainError('VALIDATION_ERROR', 'La fecha de inicio está a más de un año: revisá el dato.');
  }

  // RN-16: copia literal del pack; a partir de acá el catálogo puede cambiar.
  const snapshot = {
    name: pack.name,
    classCount: pack.classCount,
    durationDays: pack.durationDays,
    price: pack.price,
    currency: pack.currency,
    paymentMethod: pack.paymentMethod,
  };

  const doc: PackAssignmentDoc = {
    _id: new ObjectId(),
    orgId,
    userId: membership.userId,
    packId: pack._id,
    snapshot,
    startsAt: new Date(`${startsYmd}T00:00:00.000Z`),
    expiresAt: endOfDayInTz(addDaysYmd(startsYmd, snapshot.durationDays), timezone),
    classesUsed: 0,
    // Activo aunque `startsAt` sea futuro: el pack ya es visible y válido; F4-01
    // filtra por `startsAt <= now` para permitir reservar.
    status: 'active',
    payment: {
      amount: body.payment?.amount ?? snapshot.price,
      method: body.payment?.method ?? snapshot.paymentMethod,
      paidAt: body.payment?.paidAt ? new Date(body.payment.paidAt) : now,
      ...(body.payment?.notes !== undefined ? { notes: body.payment.notes } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
  // RN-17: se permiten varios activos solapados, sin validación extra.
  await insertAssignment(doc);
  return toDto(doc);
}

/** Historial del miembro (vista CRM). */
export async function listForMember(
  org: OrgContext,
  membershipId: string,
  query: AssignmentsQuery,
): Promise<AssignmentDto[]> {
  const orgId = new ObjectId(org.orgId);
  const membership = await findMembership(orgId, new ObjectId(membershipId));
  if (!membership) throw new DomainError('NOT_FOUND', 'Cliente inexistente.');
  if (!membership.userId) return []; // pre-carga sin cuenta: todavía sin historial

  const docs = await listAssignments(orgId, membership.userId, query.status);
  return docs.map(toDto);
}

/** Las del caller en la org activa (base de la pantalla de saldo, F4-06). */
export async function listMine(
  org: OrgContext,
  userId: string,
  query: AssignmentsQuery,
): Promise<AssignmentDto[]> {
  const docs = await listAssignments(new ObjectId(org.orgId), new ObjectId(userId), query.status);
  return docs.map(toDto);
}

/**
 * Cancelación manual. Solo desde `active`: `expired`/`exhausted` son estados
 * terminales (RN-13). Las reservas futuras hechas contra este pack quedan en
 * pie; si el atleta las cancela, el crédito vuelve a un pack cancelado y por
 * lo tanto es inutilizable — comportamiento aceptado, documentado acá.
 */
export async function cancelAssignment(
  org: OrgContext,
  assignmentId: string,
  reason: string,
): Promise<AssignmentDto> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(assignmentId);
  const current = await findAssignment(orgId, id);
  if (!current) throw new DomainError('NOT_FOUND', 'La asignación no existe.');
  if (current.status !== 'active') {
    throw new DomainError(
      'VALIDATION_ERROR',
      `La asignación está ${current.status}: solo se cancelan las vigentes.`,
    );
  }
  const updated = await updateAssignment(orgId, id, { status: 'cancelled', cancelledReason: reason });
  if (!updated) throw new DomainError('NOT_FOUND', 'La asignación no existe.');
  return toDto(updated);
}
