import type { CreatePackBody, PackDto, PacksQuery, UpdatePackBody } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import type { PackDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import {
  activeAssignmentsByPack,
  countActiveAssignments,
  countAnyAssignments,
  deletePack,
  findPack,
  insertPack,
  listPacks,
  updatePack,
} from './packs.repo.js';

type OrgContext = AppVariables['org'];

/**
 * Campos que quedan congelados mientras el pack tenga asignaciones `active`
 * (RN-14): cambiarlos alteraría lo que el gimnasio ya le vendió a alguien.
 * `name` e `internalNotes` sí se editan siempre — el cliente no los ve
 * cambiar porque su asignación guarda un snapshot propio (RN-16).
 */
const LOCKED_WITH_ACTIVE = ['classCount', 'durationDays', 'price', 'paymentMethod'] as const;

function toPackDto(doc: PackDoc, activeAssignments: number): PackDto {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    classCount: doc.classCount,
    durationDays: doc.durationDays,
    price: doc.price,
    currency: doc.currency,
    paymentMethod: doc.paymentMethod,
    ...(doc.internalNotes !== undefined ? { internalNotes: doc.internalNotes } : {}),
    ...(doc.archivedAt ? { archivedAt: doc.archivedAt.toISOString() } : {}),
    activeAssignments,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const notFound = () => new DomainError('NOT_FOUND', 'El pack no existe.');

export async function list(org: OrgContext, query: PacksQuery): Promise<PackDto[]> {
  const docs = await listPacks(new ObjectId(org.orgId), query.includeArchived);
  const counts = await activeAssignmentsByPack(docs.map((d) => d._id));
  return docs.map((d) => toPackDto(d, counts.get(d._id.toHexString()) ?? 0));
}

export async function create(org: OrgContext, body: CreatePackBody): Promise<PackDto> {
  const now = new Date();
  const doc: PackDoc = {
    _id: new ObjectId(),
    orgId: new ObjectId(org.orgId),
    name: body.name,
    classCount: body.classCount,
    durationDays: body.durationDays,
    price: body.price,
    currency: 'ARS', // lo fija el server: el body no lo acepta
    paymentMethod: body.paymentMethod,
    ...(body.internalNotes !== undefined ? { internalNotes: body.internalNotes } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await insertPack(doc);
  return toPackDto(doc, 0);
}

/**
 * PATCH con la matriz RN-14. El conteo de activas y el update no son atómicos:
 * si entra una asignación en el medio, el cambio se cuela — pero el cliente ya
 * está protegido por su snapshot (RN-16), así que la ventana es aceptable y no
 * justifica una transacción acá.
 */
export async function update(
  org: OrgContext,
  packId: string,
  body: UpdatePackBody,
): Promise<PackDto> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(packId);
  const current = await findPack(orgId, id);
  if (!current) throw notFound();

  const touchesLocked = LOCKED_WITH_ACTIVE.filter((field) => body[field] !== undefined);
  const activeAssignments = await countActiveAssignments(id);

  if (touchesLocked.length > 0 && activeAssignments > 0) {
    throw new DomainError(
      'PACK_IN_USE',
      `El pack tiene ${activeAssignments} asignación(es) vigente(s): no se pueden cambiar ${touchesLocked.join(', ')}. Creá un pack nuevo o esperá a que venzan.`,
      { activeAssignments, lockedFields: touchesLocked },
    );
  }

  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  if (body.name !== undefined) set.name = body.name;
  for (const field of LOCKED_WITH_ACTIVE) {
    const value = body[field];
    if (value !== undefined) set[field] = value;
  }
  if (body.internalNotes !== undefined) {
    if (body.internalNotes === null) unset.push('internalNotes');
    else set.internalNotes = body.internalNotes;
  }

  const updated =
    Object.keys(set).length > 0 || unset.length > 0
      ? await updatePack(orgId, id, set, unset)
      : current;
  if (!updated) throw notFound();
  return toPackDto(updated, activeAssignments);
}

/** Solo se borra un pack que nunca se usó; si tuvo historial, se archiva (RN-15). */
export async function remove(org: OrgContext, packId: string): Promise<void> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(packId);
  const current = await findPack(orgId, id);
  if (!current) throw notFound();

  const used = await countAnyAssignments(id);
  if (used > 0) {
    throw new DomainError(
      'PACK_IN_USE',
      `El pack tiene ${used} asignación(es) en el historial: archivalo en su lugar.`,
      { assignments: used },
    );
  }
  const deleted = await deletePack(orgId, id);
  if (!deleted) throw notFound();
}

/** Archivar (RN-15): deja de ser asignable pero sigue visible en el historial. */
export async function setArchived(
  org: OrgContext,
  packId: string,
  archived: boolean,
): Promise<PackDto> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(packId);
  const updated = archived
    ? await updatePack(orgId, id, { archivedAt: new Date() })
    : await updatePack(orgId, id, {}, ['archivedAt']);
  if (!updated) throw notFound();
  return toPackDto(updated, await countActiveAssignments(id));
}
