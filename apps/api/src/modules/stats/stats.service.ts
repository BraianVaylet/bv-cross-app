import type { ExerciseDto, PrEntryDto, ProgressDto } from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import type { RmEntryDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import { markPrs, measureOf } from './pr-rule.js';
import {
  exercisesWithDataFor,
  findCatalogExercise,
  listHistoryForPairs,
  listMemberProgress,
  listRecentEntriesWithExercise,
  findMembership,
  namesOf,
} from './stats.repo.js';

type OrgContext = AppVariables['org'];

/** Cuántas entries se examinan para armar el feed (ver `stats.repo.ts`). */
const FEED_SCAN_FACTOR = 10;

const pairKey = (userId: ObjectId, exerciseId: ObjectId): string =>
  `${userId.toHexString()}:${exerciseId.toHexString()}`;

/**
 * Resuelve la ficha del CRM a la cuenta detrás.
 *
 * Se llama ANTES de parsear la query: el `:id` identifica el recurso, así que
 * una ficha de otra org tiene que dar 404 aunque falte el `exerciseId` — si no,
 * un 400 de validación taparía el 404 y la suite de aislamiento (con razón) lo
 * marca. `null` = la ficha existe pero es una pre-carga sin cuenta: estado
 * legítimo, sin historial que mostrar.
 */
export async function resolveMemberUser(
  org: OrgContext,
  membershipId: string,
): Promise<ObjectId | null> {
  const orgId = new ObjectId(org.orgId);
  const membership = await findMembership(orgId, new ObjectId(membershipId));
  if (!membership) throw new DomainError('NOT_FOUND', 'Cliente inexistente.');
  return membership.userId;
}

/**
 * Evolución de un cliente en un ejercicio del catálogo (F3-09).
 *
 * `currentRm` es el de FECHA más reciente (RN-22), que puede no ser el mejor:
 * si alguien bajó de marca, el vigente baja con él. Por eso también viaja
 * `best`, que es otra pregunta.
 */
export async function memberProgress(
  org: OrgContext,
  userId: ObjectId | null,
  exerciseId: string,
): Promise<ProgressDto> {
  const orgId = new ObjectId(org.orgId);
  const exId = new ObjectId(exerciseId);

  const exercise = await findCatalogExercise(orgId, exId);
  if (!exercise) throw new DomainError('NOT_FOUND', 'El ejercicio no está en el catálogo.');

  // Pre-carga sin cuenta: el ejercicio existe, el historial todavía no.
  const docs = userId ? await listMemberProgress(orgId, userId, exId) : [];
  const marked = markPrs(docs.map((d) => ({ doc: d, value: measureOf(d) })));

  return {
    exerciseId: exercise._id.toHexString(),
    exerciseName: exercise.name,
    type: exercise.type,
    points: marked.map(({ doc, value, isPr }) => ({
      id: doc._id.toHexString(),
      value,
      date: doc.date,
      ...(doc.comment !== undefined ? { comment: doc.comment } : {}),
      ...(doc.painFlag !== undefined ? { painFlag: doc.painFlag } : {}),
      isPr,
    })),
    // Último por fecha (los docs ya vienen ordenados asc).
    currentRm: docs.length > 0 ? measureOf(docs[docs.length - 1] as RmEntryDoc) : null,
    best: docs.length > 0 ? Math.max(...docs.map(measureOf)) : null,
  };
}

/** Ejercicios del catálogo con datos de este cliente (llena el selector del CRM). */
export async function memberExercisesWithData(
  org: OrgContext,
  userId: ObjectId | null,
): Promise<ExerciseDto[]> {
  if (!userId) return []; // pre-carga: todavía no cargó nada
  const docs = await exercisesWithDataFor(new ObjectId(org.orgId), userId);
  return docs.map((d) => ({
    id: d._id.toHexString(),
    scope: d.scope,
    name: d.name,
    ...(d.discipline !== undefined ? { discipline: d.discipline } : {}),
    type: d.type,
    ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl } : {}),
    ...(d.notes !== undefined ? { notes: d.notes } : {}),
    ...(d.archivedAt ? { archivedAt: d.archivedAt.toISOString() } : {}),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

/**
 * Últimos récords del gimnasio, lo más nuevo primero.
 *
 * Se toman las entries recientes, se reconstruye el historial de esos pares
 * y se marca con la MISMA regla que el progreso (`markPrs`): una sola
 * definición de PR en todo el sistema.
 */
export async function prsFeed(org: OrgContext, limit: number): Promise<PrEntryDto[]> {
  const orgId = new ObjectId(org.orgId);

  const recientes = await listRecentEntriesWithExercise(orgId, limit * FEED_SCAN_FACTOR);
  if (recientes.length === 0) return [];

  // Pares únicos que aparecen en la ventana examinada.
  const pares = new Map<string, { userId: ObjectId; exerciseId: ObjectId }>();
  for (const row of recientes) {
    pares.set(pairKey(row.userId, row.exerciseId), {
      userId: row.userId,
      exerciseId: row.exerciseId,
    });
  }

  const historial = await listHistoryForPairs(orgId, [...pares.values()]);
  const porPar = new Map<string, RmEntryDoc[]>();
  for (const doc of historial) {
    const key = pairKey(doc.userId, doc.exerciseId);
    const lista = porPar.get(key);
    if (lista) lista.push(doc);
    else porPar.set(key, [doc]);
  }

  // Marcar cada par completo y quedarse con los PRs.
  const prs = new Map<string, { improvement: number | null }>();
  for (const docs of porPar.values()) {
    for (const marked of markPrs(docs.map((d) => ({ doc: d, value: measureOf(d) })))) {
      if (marked.isPr) {
        prs.set(marked.doc._id.toHexString(), { improvement: marked.improvement });
      }
    }
  }

  const conNombre = recientes.filter((row) => prs.has(row._id.toHexString())).slice(0, limit);
  const nombres = await namesOf([...new Set(conNombre.map((r) => r.userId.toHexString()))].map(
    (id) => new ObjectId(id),
  ));

  return conNombre.map((row) => ({
    id: row._id.toHexString(),
    userId: row.userId.toHexString(),
    userName: nombres.get(row.userId.toHexString()) ?? '(sin nombre)',
    exerciseId: row.exerciseId.toHexString(),
    exerciseName: row.exercise.name,
    type: row.exercise.type,
    value: measureOf(row),
    improvement: prs.get(row._id.toHexString())?.improvement ?? null,
    date: row.date,
  }));
}
