import {
  can,
  type CreateExerciseBody,
  type ExerciseDto,
  type ExercisesQuery,
  type UpdateExerciseBody,
} from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import { DomainError } from '../../lib/errors.js';
import type { ExerciseDoc } from '../../db/types.js';
import {
  countEntries,
  deletePersonalWithEntries,
  exercisesWithEntries,
  findCatalogByName,
  findVisible,
  insertExercise,
  listExercises,
  setArchived,
  updateExercise,
} from './exercises.repo.js';

type OrgContext = AppVariables['org'];

function toDto(doc: ExerciseDoc, hasEntries?: boolean): ExerciseDto {
  return {
    id: doc._id.toHexString(),
    scope: doc.scope,
    name: doc.name,
    ...(doc.discipline !== undefined ? { discipline: doc.discipline } : {}),
    type: doc.type,
    ...(doc.imageUrl !== undefined ? { imageUrl: doc.imageUrl } : {}),
    ...(doc.notes !== undefined ? { notes: doc.notes } : {}),
    ...(doc.archivedAt ? { archivedAt: doc.archivedAt.toISOString() } : {}),
    ...(hasEntries !== undefined ? { hasEntries } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const notFound = () => new DomainError('NOT_FOUND', 'Ejercicio inexistente.');

export async function list(
  org: OrgContext,
  userId: string,
  query: ExercisesQuery,
): Promise<ExerciseDto[]> {
  if (query.includeArchived && !can(org.role, 'exercises:manage-catalog')) {
    throw new DomainError('FORBIDDEN_ROLE', 'Solo un admin puede ver archivados.');
  }
  const docs = await listExercises({
    orgId: new ObjectId(org.orgId),
    userId: new ObjectId(userId),
    scope: query.scope,
    includeArchived: query.includeArchived,
  });

  // El CRM (scope 'org', admin) necesita saber cuáles tienen historial para
  // comunicar TYPE_LOCKED antes del error; el atleta no, y no paga esa query.
  if (query.scope === 'org' && can(org.role, 'exercises:manage-catalog')) {
    const withEntries = await exercisesWithEntries(docs.map((d) => d._id));
    return docs.map((d) => toDto(d, withEntries.has(d._id.toHexString())));
  }
  return docs.map((d) => toDto(d));
}

export async function create(
  org: OrgContext,
  userId: string,
  body: CreateExerciseBody,
): Promise<ExerciseDto> {
  const orgId = new ObjectId(org.orgId);
  if (body.scope === 'org') {
    // Athlete pidiendo catálogo → 403 explícito (spec F2-01); sin scope nace personal.
    if (!can(org.role, 'exercises:manage-catalog')) {
      throw new DomainError('FORBIDDEN_ROLE', 'Solo un admin puede crear ejercicios del catálogo.');
    }
    const dup = await findCatalogByName(orgId, body.name);
    if (dup) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Ya existe "${dup.name}" en el catálogo. Editá ese ejercicio o elegí otro nombre.`,
      );
    }
  }
  const now = new Date();
  const doc: ExerciseDoc = {
    _id: new ObjectId(),
    scope: body.scope,
    orgId: body.scope === 'org' ? orgId : null,
    ownerUserId: body.scope === 'personal' ? new ObjectId(userId) : null,
    name: body.name,
    ...(body.discipline !== undefined ? { discipline: body.discipline } : {}),
    type: body.type,
    ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await insertExercise(doc);
  return toDto(doc);
}

export async function get(org: OrgContext, userId: string, id: string): Promise<ExerciseDto> {
  const doc = await findVisible(new ObjectId(org.orgId), new ObjectId(userId), new ObjectId(id));
  if (!doc) throw notFound(); // cross-org y personales ajenos incluidos (RN-20): 404, sin oráculo
  return toDto(doc);
}

export async function update(
  org: OrgContext,
  userId: string,
  id: string,
  body: UpdateExerciseBody,
): Promise<ExerciseDto> {
  const orgId = new ObjectId(org.orgId);
  const current = await findVisible(orgId, new ObjectId(userId), new ObjectId(id));
  if (!current) throw notFound();

  if (current.scope === 'org' && !can(org.role, 'exercises:manage-catalog')) {
    throw new DomainError('FORBIDDEN_ROLE', 'Solo un admin puede editar el catálogo.');
  }

  if (body.type !== undefined && body.type !== current.type) {
    // TYPE_LOCKED (RN-23): cambiar kg↔reps invalidaría el historial.
    if ((await countEntries(current._id)) > 0) {
      throw new DomainError('TYPE_LOCKED', 'El ejercicio tiene registros: su tipo ya no puede cambiar.');
    }
  }

  if (body.name !== undefined && current.scope === 'org') {
    const dup = await findCatalogByName(orgId, body.name, current._id);
    if (dup) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `Ya existe "${dup.name}" en el catálogo. Elegí otro nombre.`,
      );
    }
  }

  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  if (body.name !== undefined) set.name = body.name;
  if (body.type !== undefined) set.type = body.type;
  for (const key of ['discipline', 'imageUrl', 'notes'] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null) unset.push(key);
    else set[key] = value;
  }
  if (Object.keys(set).length === 0 && unset.length === 0) return toDto(current);

  const updated = await updateExercise(current._id, set, unset);
  if (!updated) throw notFound();
  return toDto(updated);
}

/** Archivar/restaurar: solo catálogo (RN-19). Personal o cross-org → 404. */
export async function archive(org: OrgContext, id: string, archived: boolean): Promise<ExerciseDto> {
  const doc = await setArchived(new ObjectId(org.orgId), new ObjectId(id), archived);
  if (!doc) throw notFound();
  return toDto(doc);
}

export async function remove(org: OrgContext, userId: string, id: string): Promise<void> {
  const owner = new ObjectId(userId);
  const current = await findVisible(new ObjectId(org.orgId), owner, new ObjectId(id));
  if (!current) throw notFound();
  if (current.scope === 'org') {
    // Spec F2-01 caso 6: el catálogo no se borra, se archiva.
    throw new DomainError('FORBIDDEN_ROLE', 'El catálogo no se borra: archivalo.');
  }
  const deleted = await deletePersonalWithEntries(owner, current._id);
  if (!deleted) throw notFound();
}
