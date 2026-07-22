import Database from 'better-sqlite3';
import { ObjectId } from 'mongodb';
import { getClient } from './db/client.js';
import { exercises, rmEntries, users } from './db/collections.js';
import type { ExerciseDoc, RmEntryDoc } from './db/types.js';
import { generateToken, hashPassword } from './lib/crypto.js';

/**
 * Migración one-shot v1 (SQLite, alias) → v2 (Mongo, email) del usuario dueño
 * (docs/tasks/F2.md F2-08). Los ejercicios de v1 son todos personales; se
 * migran como `scope:'personal'` sin org. Idempotencia NO garantizada: correr
 * dos veces con `--commit` duplica. Rollback: ver scripts/README-migrate.md.
 */

interface V1User {
  id: number;
  alias: string;
  alias_display: string;
}
interface V1Exercise {
  id: number;
  name: string;
  observacion: string | null;
  dolor: number;
  gimnastico: number;
  created_at: string;
  updated_at: string;
}
interface V1Entry {
  id: number;
  exercise_id: number;
  rm_kg: number | null;
  reps: number | null;
  date: string;
  comment: string | null;
  created_at: string;
}

export interface MigrateOpts {
  sqlitePath: string;
  email: string;
  name: string;
  commit: boolean;
  /** Elegir el usuario v1 cuando la DB tiene más de uno. */
  alias?: string;
  /** Adjuntar a un usuario v2 ya existente (su _id) en vez de crear uno. */
  linkUserId?: string;
}

export interface ExcludedEntry {
  id: number;
  reason: string;
}

export interface MigratePlan {
  v1Counts: { exercises: number; entries: number };
  willMigrate: { exercises: number; entries: number };
  excluded: ExcludedEntry[];
  target: { kind: 'new-user' | 'linked-user'; email: string; userId?: string };
}

export interface MigrateResult {
  plan: MigratePlan;
  committed: boolean;
  /** Password temporal generada (solo si se creó un usuario nuevo). */
  tempPassword?: string;
  verification?: {
    exercisesV1: number;
    exercisesV2: number;
    entriesV1: number;
    entriesV2: number;
    currentRmSpotCheck: Array<{ exercise: string; date: string; measure: string; ok: boolean }>;
  };
}

/** ISO a partir del `datetime('now')` de v1 (SQLite guarda "YYYY-MM-DD HH:MM:SS"). */
function toDate(v1Timestamp: string): Date {
  const iso = v1Timestamp.includes('T') ? v1Timestamp : `${v1Timestamp.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pickUser(db: Database.Database, alias?: string): V1User {
  const rows = db.prepare('SELECT id, alias, alias_display FROM users ORDER BY id').all() as V1User[];
  if (rows.length === 0) throw new Error('La DB v1 no tiene usuarios.');
  if (alias) {
    const found = rows.find((u) => u.alias === alias);
    if (!found) throw new Error(`No hay un usuario v1 con alias "${alias}".`);
    return found;
  }
  if (rows.length > 1) {
    const aliases = rows.map((u) => u.alias).join(', ');
    throw new Error(`La DB v1 tiene ${rows.length} usuarios; pasá --alias para elegir. Disponibles: ${aliases}`);
  }
  const [only] = rows;
  if (!only) throw new Error('La DB v1 no tiene usuarios.');
  return only;
}

/**
 * Construye el plan de migración (sin escribir). Valida el XOR de medida
 * contra el tipo del ejercicio y excluye las entries sucias con motivo.
 */
export async function planMigration(db: Database.Database, opts: MigrateOpts): Promise<{
  plan: MigratePlan;
  v1User: V1User;
  v1Exercises: V1Exercise[];
  entriesByExercise: Map<number, V1Entry[]>;
  existingUserId: ObjectId | null;
}> {
  const v1User = pickUser(db, opts.alias);

  const v1Exercises = db
    .prepare(
      'SELECT id, name, observacion, dolor, gimnastico, created_at, updated_at FROM exercises WHERE user_id = ? ORDER BY id',
    )
    .all(v1User.id) as V1Exercise[];

  const excluded: ExcludedEntry[] = [];
  const entriesByExercise = new Map<number, V1Entry[]>();
  let entryCount = 0;

  for (const ex of v1Exercises) {
    const rows = db
      .prepare(
        'SELECT id, exercise_id, rm_kg, reps, date, comment, created_at FROM rm_entries WHERE exercise_id = ? ORDER BY date DESC, id DESC',
      )
      .all(ex.id) as V1Entry[];
    const wantsReps = ex.gimnastico === 1;
    const kept: V1Entry[] = [];
    for (const e of rows) {
      const hasKg = e.rm_kg !== null && e.rm_kg > 0;
      const hasReps = e.reps !== null && e.reps > 0;
      // XOR consistente con el tipo (RN-23). Sucio → excluir, no abortar.
      if (wantsReps && !hasReps) {
        excluded.push({ id: e.id, reason: `ejercicio de reps sin reps (rm_kg=${e.rm_kg}, reps=${e.reps})` });
      } else if (!wantsReps && !hasKg) {
        excluded.push({ id: e.id, reason: `ejercicio de peso sin kg (rm_kg=${e.rm_kg}, reps=${e.reps})` });
      } else {
        kept.push(e);
      }
    }
    entriesByExercise.set(ex.id, kept);
    entryCount += kept.length;
  }

  // email libre (o link a user existente)
  const existing = await users().findOne({ email: opts.email.toLowerCase() });
  let existingUserId: ObjectId | null = null;
  if (opts.linkUserId) {
    existingUserId = new ObjectId(opts.linkUserId);
    const linked = await users().findOne({ _id: existingUserId });
    if (!linked) throw new Error(`--link-user: no existe un usuario v2 con _id ${opts.linkUserId}.`);
  } else if (existing) {
    throw new Error(
      `El email ${opts.email} ya tiene cuenta en v2. Usá --link-user <id> para adjuntar, o elegí otro email.`,
    );
  }

  const totalEntries = db.prepare('SELECT COUNT(*) AS n FROM rm_entries WHERE exercise_id IN (SELECT id FROM exercises WHERE user_id = ?)').get(v1User.id) as { n: number };

  const plan: MigratePlan = {
    v1Counts: { exercises: v1Exercises.length, entries: totalEntries.n },
    willMigrate: { exercises: v1Exercises.length, entries: entryCount },
    excluded,
    target: existingUserId
      ? { kind: 'linked-user', email: opts.email, userId: existingUserId.toHexString() }
      : { kind: 'new-user', email: opts.email },
  };

  return { plan, v1User, v1Exercises, entriesByExercise, existingUserId };
}

export async function runMigration(opts: MigrateOpts): Promise<MigrateResult> {
  const db = new Database(opts.sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const { plan, v1Exercises, entriesByExercise, existingUserId } = await planMigration(db, opts);

    if (!opts.commit) return { plan, committed: false };

    const now = new Date();
    let tempPassword: string | undefined;

    // Usuario destino: nuevo (password random → reset por email) o el linkeado.
    let userId = existingUserId;
    if (!userId) {
      tempPassword = generateToken(); // el dueño no la usa: se resetea por email
      userId = new ObjectId();
      await users().insertOne({
        _id: userId,
        email: opts.email.toLowerCase(),
        emailVerifiedAt: now, // el dueño de la migración es confiable
        name: opts.name,
        passwordHash: await hashPassword(tempPassword),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Ejercicios: v1.id → v2 _id, todos personales sin org.
    const idMap = new Map<number, ObjectId>();
    const exerciseDocs: ExerciseDoc[] = v1Exercises.map((ex) => {
      const _id = new ObjectId();
      idMap.set(ex.id, _id);
      const notes = buildNotes(ex.observacion, ex.dolor === 1);
      return {
        _id,
        scope: 'personal',
        orgId: null,
        ownerUserId: userId,
        name: ex.name,
        type: ex.gimnastico === 1 ? 'reps' : 'weight',
        ...(notes ? { notes } : {}),
        createdAt: toDate(ex.created_at),
        updatedAt: toDate(ex.updated_at),
      };
    });
    if (exerciseDocs.length > 0) await exercises().insertMany(exerciseDocs);

    // Entries: preservan createdAt; orgId null (personales, RN-21).
    const entryDocs: RmEntryDoc[] = [];
    for (const [v1ExId, entries] of entriesByExercise) {
      const exerciseId = idMap.get(v1ExId);
      if (!exerciseId) continue;
      for (const e of entries) {
        entryDocs.push({
          _id: new ObjectId(),
          exerciseId,
          userId,
          orgId: null,
          ...(e.rm_kg !== null && e.rm_kg > 0 ? { kg: e.rm_kg } : {}),
          ...(e.reps !== null && e.reps > 0 ? { reps: e.reps } : {}),
          date: e.date,
          ...(e.comment ? { comment: e.comment } : {}),
          createdAt: toDate(e.created_at),
        });
      }
    }
    if (entryDocs.length > 0) await rmEntries().insertMany(entryDocs);

    const verification = await verify(userId, plan, entriesByExercise, v1Exercises);
    return { plan, committed: true, ...(tempPassword ? { tempPassword } : {}), verification };
  } finally {
    db.close();
  }
}

/** Nota del ejercicio: observación de v1 + marca de dolor (v2 modela dolor por entry). */
function buildNotes(observacion: string | null, dolor: boolean): string | undefined {
  const parts: string[] = [];
  if (observacion?.trim()) parts.push(observacion.trim());
  if (dolor) parts.push('v1: marcado con dolor');
  const joined = parts.join(' · ');
  return joined ? joined.slice(0, 500) : undefined;
}

async function verify(
  userId: ObjectId,
  plan: MigratePlan,
  entriesByExercise: Map<number, V1Entry[]>,
  v1Exercises: V1Exercise[],
): Promise<NonNullable<MigrateResult['verification']>> {
  const exercisesV2 = await exercises().countDocuments({ ownerUserId: userId });
  const entriesV2 = await rmEntries().countDocuments({ userId });

  // Spot-check: los 3 ejercicios con más historial — su RM vigente (fecha más
  // reciente, orden RN-22) debe coincidir con lo que se ve en v2.
  const top = [...entriesByExercise.entries()]
    // las entries vienen ordenadas date desc, id desc: la primera es la vigente
    .flatMap(([id, list]) => (list[0] ? [{ id, current: list[0], count: list.length }] : []))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const currentRmSpotCheck = await Promise.all(
    top.map(async ({ id: v1ExId, current: v1Current }) => {
      const v1Name = v1Exercises.find((e) => e.id === v1ExId)?.name ?? '';
      const v2Ex = await exercises().findOne({ ownerUserId: userId, name: v1Name });
      const v2Current = v2Ex
        ? await rmEntries()
            .find({ exerciseId: v2Ex._id })
            .sort({ date: -1, _id: -1 })
            .limit(1)
            .next()
        : null;
      const measure = v1Current.reps !== null ? `${v1Current.reps} reps` : `${v1Current.rm_kg} kg`;
      const ok =
        v2Current !== null &&
        v2Current.date === v1Current.date &&
        (v2Current.kg ?? null) === (v1Current.rm_kg ?? null) &&
        (v2Current.reps ?? null) === (v1Current.reps ?? null);
      return { exercise: v1Name, date: v1Current.date, measure, ok };
    }),
  );

  return {
    exercisesV1: plan.v1Counts.exercises,
    exercisesV2,
    entriesV1: plan.willMigrate.entries,
    entriesV2,
    currentRmSpotCheck,
  };
}

/** Rollback: borra el usuario creado por la migración y todos sus datos. */
export async function rollbackMigration(userId: string): Promise<void> {
  const id = new ObjectId(userId);
  const session = getClient().startSession();
  try {
    await session.withTransaction(async () => {
      await rmEntries().deleteMany({ userId: id }, { session });
      await exercises().deleteMany({ ownerUserId: id }, { session });
      await users().deleteOne({ _id: id }, { session });
    });
  } finally {
    await session.endSession();
  }
}
