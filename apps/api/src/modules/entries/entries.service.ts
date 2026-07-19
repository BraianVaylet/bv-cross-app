import type { CreateEntryBody, EntriesQuery, EntryDto, Page } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import { memberships, organizations } from '../../db/collections.js';
import type { RmEntryDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import { findVisible } from '../exercises/exercises.repo.js';
import {
  countOwnForExercise,
  deleteOwn,
  findOwn,
  insertEntry,
  listForMemberInOrg,
  listOwn,
  type ListOpts,
} from './entries.repo.js';

type OrgContext = AppVariables['org'];

function toDto(doc: RmEntryDoc): EntryDto {
  return {
    id: doc._id.toHexString(),
    exerciseId: doc.exerciseId.toHexString(),
    ...(doc.kg !== undefined ? { kg: doc.kg } : {}),
    ...(doc.reps !== undefined ? { reps: doc.reps } : {}),
    date: doc.date,
    ...(doc.comment !== undefined ? { comment: doc.comment } : {}),
    ...(doc.painFlag !== undefined ? { painFlag: doc.painFlag } : {}),
    createdAt: doc.createdAt.toISOString(),
  };
}

const notFound = () => new DomainError('NOT_FOUND', 'Registro inexistente.');

function toPage(rows: RmEntryDoc[], limit: number): Page<EntryDto> {
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

function listOpts(query: EntriesQuery): ListOpts {
  return {
    ...(query.exerciseId ? { exerciseId: new ObjectId(query.exerciseId) } : {}),
    ...(query.after ? { after: new ObjectId(query.after) } : {}),
    limit: query.limit,
  };
}

/** Fecha de calendario "hoy" en la timezone dada (en-CA ⇒ YYYY-MM-DD). */
function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export async function create(
  org: OrgContext,
  userId: string,
  body: CreateEntryBody,
): Promise<EntryDto> {
  const orgId = new ObjectId(org.orgId);
  const owner = new ObjectId(userId);

  const exercise = await findVisible(orgId, owner, new ObjectId(body.exerciseId));
  if (!exercise) throw notFound(); // personal ajeno o cross-org: 404, sin oráculo

  if (exercise.archivedAt) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'El ejercicio está archivado: el historial se conserva pero no admite registros nuevos.',
    );
  }

  // WRONG_MEASURE (RN-23): el XOR estructural ya pasó en el schema; acá se
  // cruza la medida contra el tipo del ejercicio.
  const expected = exercise.type === 'weight' ? 'kg' : 'reps';
  if ((expected === 'kg' && body.kg === undefined) || (expected === 'reps' && body.reps === undefined)) {
    throw new DomainError('VALIDATION_ERROR', `Este ejercicio registra ${expected}.`, {
      code: 'WRONG_MEASURE',
      expected,
    });
  }

  // RN de fecha: no futura EN LA TIMEZONE DE LA ORG (una carga "de hoy" a las
  // 23:30 AR no se rechaza porque en UTC ya sea mañana).
  const orgDoc = await organizations().findOne({ _id: orgId }, { projection: { timezone: 1 } });
  const today = todayIn(orgDoc?.timezone ?? 'UTC');
  if (body.date > today) {
    throw new DomainError('VALIDATION_ERROR', 'La fecha no puede ser futura.');
  }

  const doc: RmEntryDoc = {
    _id: new ObjectId(),
    exerciseId: exercise._id,
    userId: owner,
    // RN-21: catálogo → contexto de la org; personal → null (invisible al CRM)
    orgId: exercise.scope === 'org' ? exercise.orgId : null,
    ...(body.kg !== undefined ? { kg: body.kg } : {}),
    ...(body.reps !== undefined ? { reps: body.reps } : {}),
    date: body.date,
    ...(body.comment !== undefined ? { comment: body.comment } : {}),
    ...(body.painFlag !== undefined ? { painFlag: body.painFlag } : {}),
    createdAt: new Date(),
  };
  await insertEntry(doc);
  return toDto(doc);
}

export async function list(userId: string, query: EntriesQuery): Promise<Page<EntryDto>> {
  const rows = await listOwn(new ObjectId(userId), listOpts(query));
  return toPage(rows, query.limit);
}

export async function remove(userId: string, id: string): Promise<void> {
  const owner = new ObjectId(userId);
  const entry = await findOwn(owner, new ObjectId(id));
  if (!entry) throw notFound(); // ajena: 404, no 403 (sin oráculo)

  // Regla v1: la última entry del ejercicio no se borra (conserva el RM).
  if ((await countOwnForExercise(owner, entry.exerciseId)) <= 1) {
    throw new DomainError('LAST_ENTRY', 'Es el único registro del ejercicio: no se puede borrar.');
  }
  const deleted = await deleteOwn(owner, entry._id);
  if (!deleted) throw notFound();
}

/** Vista CRM (RN-20): entries del miembro SOLO sobre catálogo de la org. */
export async function listForMember(
  org: OrgContext,
  membershipId: string,
  query: EntriesQuery,
): Promise<Page<EntryDto>> {
  const orgId = new ObjectId(org.orgId);
  const membership = await memberships().findOne({ _id: new ObjectId(membershipId), orgId });
  if (!membership) throw new DomainError('NOT_FOUND', 'Cliente inexistente.');
  if (!membership.userId) return { items: [], nextCursor: null }; // pre-carga: sin cuenta aún

  const rows = await listForMemberInOrg(orgId, membership.userId, listOpts(query));
  return toPage(rows, query.limit);
}
