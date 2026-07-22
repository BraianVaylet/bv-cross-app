import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exercises, rmEntries, users } from './db/collections.js';
import { rollbackMigration, runMigration } from './migrate-v1.js';
import { startTestDb, stopTestDb } from './test/mongo.js';

/** Esquema v1 final (001_init + 002_exercise_meta + 003_gimnastico). */
const V1_SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE,
  alias_display TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  security_question_id INTEGER NOT NULL,
  security_answer_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  observacion TEXT,
  dolor INTEGER NOT NULL DEFAULT 0,
  gimnastico INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE rm_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  rm_kg REAL CHECK (rm_kg IS NULL OR rm_kg > 0),
  reps INTEGER CHECK (reps IS NULL OR reps > 0),
  date TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let tmpDir: string;
let dbPath: string;

interface FixtureOpts {
  /** Agrega una entry sin kg ni reps (dato sucio de v1). */
  withCorruptEntry?: boolean;
  /** Segundo usuario para probar la exigencia de --alias. */
  withSecondUser?: boolean;
}

/** Fixture: 2 ejercicios (1 gimnástico con observación+dolor) y 5 entries. */
function makeV1Db(opts: FixtureOpts = {}): void {
  const db = new Database(dbPath);
  db.exec(V1_SCHEMA);
  db.prepare(
    "INSERT INTO users (alias, alias_display, password_hash, security_question_id, security_answer_hash) VALUES ('braian', 'Braian', 'scrypt$x', 1, 'x')",
  ).run();
  if (opts.withSecondUser) {
    db.prepare(
      "INSERT INTO users (alias, alias_display, password_hash, security_question_id, security_answer_hash) VALUES ('otro', 'Otro', 'scrypt$x', 1, 'x')",
    ).run();
  }

  db.prepare(
    "INSERT INTO exercises (id, user_id, name, observacion, dolor, gimnastico, created_at, updated_at) VALUES (1, 1, 'Back Sq', 'Cuidar rodilla', 1, 0, '2026-01-05 10:00:00', '2026-02-01 10:00:00')",
  ).run();
  db.prepare(
    "INSERT INTO exercises (id, user_id, name, observacion, dolor, gimnastico, created_at, updated_at) VALUES (2, 1, 'Pull-ups', NULL, 0, 1, '2026-01-06 10:00:00', '2026-02-02 10:00:00')",
  ).run();

  const entry = db.prepare(
    'INSERT INTO rm_entries (exercise_id, rm_kg, reps, date, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  // Ejercicio de peso: 3 entries (la vigente es la de 2026-06-20)
  entry.run(1, 100, null, '2026-05-10', 'con cinturón', '2026-05-10 12:00:00');
  entry.run(1, 110, null, '2026-06-20', null, '2026-06-20 12:00:00');
  entry.run(1, 105, null, '2026-06-01', null, '2026-06-01 12:00:00');
  // Ejercicio gimnástico: 2 entries
  entry.run(2, null, 12, '2026-05-15', null, '2026-05-15 12:00:00');
  entry.run(2, null, 15, '2026-06-25', 'sin kipping', '2026-06-25 12:00:00');

  if (opts.withCorruptEntry) {
    entry.run(1, null, null, '2026-07-01', 'entry sucia', '2026-07-01 12:00:00');
  }
  db.close();
}

const baseOpts = { email: 'braian@demo.test', name: 'Braian' };

/** Estrecha a no-nulo fallando con un mensaje útil si el fixture no cuadra. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`fixture: falta ${what}`);
  return value;
}

describe('migrate-v1 (F2-08)', () => {
  beforeAll(startTestDb, 120_000);
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    return stopTestDb();
  });

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bv-v1-'));
    dbPath = join(tmpDir, 'v1.db');
    await Promise.all([
      users().deleteMany({}),
      exercises().deleteMany({}),
      rmEntries().deleteMany({}),
    ]);
  });

  it('caso 1: dry-run reporta 2 ejercicios / 5 registros y NO escribe nada', async () => {
    makeV1Db();
    const res = await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: false });

    expect(res.committed).toBe(false);
    expect(res.plan.v1Counts).toEqual({ exercises: 2, entries: 5 });
    expect(res.plan.willMigrate).toEqual({ exercises: 2, entries: 5 });
    expect(res.plan.target.kind).toBe('new-user');
    // cero escrituras
    expect(await users().countDocuments({})).toBe(0);
    expect(await exercises().countDocuments({})).toBe(0);
    expect(await rmEntries().countDocuments({})).toBe(0);
  });

  it('caso 2: --commit migra con conteos exactos, tipos, notas y createdAt preservado', async () => {
    makeV1Db();
    const res = await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: true });

    expect(res.committed).toBe(true);
    const user = await users().findOne({ email: 'braian@demo.test' });
    expect(user).not.toBeNull();
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date); // el dueño es confiable
    expect(user?.name).toBe('Braian');

    expect(await exercises().countDocuments({ ownerUserId: must(user, 'user')._id })).toBe(2);
    expect(await rmEntries().countDocuments({ userId: must(user, 'user')._id })).toBe(5);

    // gimnastico=1 → type reps; sus entries llevan reps y no kg
    const pullups = await exercises().findOne({ name: 'Pull-ups' });
    expect(pullups?.type).toBe('reps');
    expect(pullups?.scope).toBe('personal');
    expect(pullups?.orgId).toBeNull();
    const pullupEntries = await rmEntries().find({ exerciseId: must(pullups, 'pullups')._id }).toArray();
    expect(pullupEntries).toHaveLength(2);
    expect(pullupEntries.every((e) => e.reps !== undefined && e.kg === undefined)).toBe(true);
    expect(pullupEntries.every((e) => e.orgId === null)).toBe(true); // RN-21

    // observacion → notes, y el dolor de v1 se anota (v2 lo modela por entry)
    const backSq = await exercises().findOne({ name: 'Back Sq' });
    expect(backSq?.type).toBe('weight');
    expect(backSq?.notes).toBe('Cuidar rodilla · v1: marcado con dolor');
    expect(backSq?.createdAt.toISOString()).toBe('2026-01-05T10:00:00.000Z');

    const backSqEntries = await rmEntries().find({ exerciseId: must(backSq, 'backSq')._id }).toArray();
    expect(backSqEntries).toHaveLength(3);
    const vigente = backSqEntries.find((e) => e.date === '2026-06-20');
    expect(vigente?.kg).toBe(110);
    expect(vigente?.createdAt.toISOString()).toBe('2026-06-20T12:00:00.000Z');

    // verificación post-commit: conteos y spot-check del RM vigente
    expect(res.verification?.exercisesV1).toBe(res.verification?.exercisesV2);
    expect(res.verification?.entriesV1).toBe(res.verification?.entriesV2);
    expect(res.verification?.currentRmSpotCheck.every((s) => s.ok)).toBe(true);
  });

  it('caso 3: entry sin kg ni reps se excluye con motivo y el resto migra', async () => {
    makeV1Db({ withCorruptEntry: true });
    const res = await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: true });

    expect(res.plan.v1Counts.entries).toBe(6);
    expect(res.plan.willMigrate.entries).toBe(5);
    expect(res.plan.excluded).toHaveLength(1);
    expect(res.plan.excluded[0]?.reason).toMatch(/sin kg/);

    const user = await users().findOne({ email: 'braian@demo.test' });
    expect(await rmEntries().countDocuments({ userId: must(user, 'user')._id })).toBe(5);
  });

  it('email ya usado en v2 → aborta pidiendo --link-user', async () => {
    makeV1Db();
    await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: true });
    await expect(runMigration({ ...baseOpts, sqlitePath: dbPath, commit: false })).rejects.toThrow(
      /ya tiene cuenta en v2/,
    );
  });

  it('varios usuarios en v1 → exige --alias; con alias migra el elegido', async () => {
    makeV1Db({ withSecondUser: true });
    await expect(runMigration({ ...baseOpts, sqlitePath: dbPath, commit: false })).rejects.toThrow(
      /pasá --alias/,
    );
    const res = await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: false, alias: 'braian' });
    expect(res.plan.willMigrate.exercises).toBe(2);
  });

  it('rollback borra el usuario migrado con todos sus datos', async () => {
    makeV1Db();
    await runMigration({ ...baseOpts, sqlitePath: dbPath, commit: true });
    const user = await users().findOne({ email: 'braian@demo.test' });

    await rollbackMigration(must(user, 'user')._id.toHexString());

    expect(await users().countDocuments({})).toBe(0);
    expect(await exercises().countDocuments({})).toBe(0);
    expect(await rmEntries().countDocuments({})).toBe(0);
  });
});
