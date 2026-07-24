import { ObjectId } from 'mongodb';
import type { BookingDoc, ExerciseDoc } from '../db/types.js';
import {
  bookings,
  classSessions,
  exercises,
  memberships,
  organizations,
  packAssignments,
  rmEntries,
  users,
} from '../db/collections.js';

/**
 * Generador de carga sintética — herramienta permanente de presupuestos de
 * performance (F3-10, [Escalabilidad §0](../../docs/07-escalabilidad.md)).
 *
 * Multiplica el volumen de referencia de UN gimnasio típico por N orgs:
 * ~150 atletas activos, ~70 sesiones/semana, ~800 reservas/mes y ~2.000
 * cargas de RM/mes. `--orgs=100` es la etapa "éxito inicial" del documento:
 * ~15k usuarios y ~80k reservas/mes.
 *
 * Por qué existe: sin datos, cualquier query es rápida. Los presupuestos se
 * miden sobre un working set del tamaño que va a tener el sistema cuando
 * importe, y eso hay que poder reproducirlo en cualquier máquina.
 *
 * El CLI vive en `scripts/loadgen.ts`; el generador vive acá para que el test
 * de presupuesto (`dashboard-perf.test.ts`) y el script usen exactamente el
 * mismo código: dos generadores que divergen dan dos mediciones incomparables.
 */

/** Volumen mensual de un gimnasio típico (Escalabilidad §0). */
const POR_ORG = {
  athletes: 150,
  sessionsPerWeek: 70,
  bookingsPerMonth: 800,
  entriesPerMonth: 2_000,
  exercises: 25,
};

const DISCIPLINAS = ['crossfit', 'hyrox', 'halterofilia', 'funcional'];
const DIA_MS = 86_400_000;

/** PRNG determinista: dos corridas con la misma semilla dan los mismos datos. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface LoadgenOptions {
  orgs: number;
  months: number;
  /** Fin de la ventana generada; los datos van hacia atrás desde acá. */
  now?: Date;
  seed?: number;
  /** Prefijo de los slugs/emails sintéticos, para poder borrarlos después. */
  tag?: string;
}

export interface LoadgenResult {
  orgIds: ObjectId[];
  docs: number;
  ms: number;
}

/**
 * Inserta N orgs sintéticas con volumen realista y devuelve sus ids.
 *
 * Se escribe con `insertMany` sin ordenar y por lotes: el objetivo es llenar
 * la base rápido, no ejercitar el camino de escritura de la app.
 */
export async function generateLoad(opts: LoadgenOptions): Promise<LoadgenResult> {
  const t0 = Date.now();
  const now = opts.now ?? new Date();
  const tag = opts.tag ?? 'loadgen';
  const rand = rng(opts.seed ?? 42);
  const dias = Math.round(opts.months * 30);
  const desde = new Date(now.getTime() - dias * DIA_MS);
  const enVentana = (): Date => new Date(desde.getTime() + rand() * (now.getTime() - desde.getTime()));

  const orgIds: ObjectId[] = [];
  let docs = 0;

  for (let o = 0; o < opts.orgs; o += 1) {
    const orgId = new ObjectId();
    orgIds.push(orgId);
    const slug = `${tag}-${o}-${orgId.toHexString().slice(-6)}`;

    await organizations().insertOne({
      _id: orgId,
      name: `Box ${tag} ${o}`,
      slug,
      joinCode: slug,
      timezone: 'America/Argentina/Buenos_Aires',
      settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
      status: 'active',
      createdAt: desde,
      updatedAt: desde,
    });

    // Atletas: user + membership. Los ids se reusan para reservas y cargas.
    const userIds: ObjectId[] = [];
    const usuarios = [];
    const fichas = [];
    for (let i = 0; i < POR_ORG.athletes; i += 1) {
      const userId = new ObjectId();
      userIds.push(userId);
      const alta = enVentana();
      usuarios.push({
        _id: userId,
        email: `${tag}-${o}-${i}@load.test`,
        emailVerifiedAt: alta,
        name: `Atleta ${i}`,
        passwordHash: 'scrypt$32768$8$1$x$x',
        createdAt: alta,
        updatedAt: alta,
      });
      fichas.push({
        _id: new ObjectId(),
        orgId,
        userId,
        role: 'athlete' as const,
        status: 'active' as const,
        profile: { displayName: `Atleta ${i}` },
        joinedAt: alta,
        createdAt: alta,
        updatedAt: alta,
      });
    }
    await users().insertMany(usuarios, { ordered: false });
    await memberships().insertMany(fichas, { ordered: false });
    docs += usuarios.length + fichas.length;

    // Catálogo de ejercicios.
    const exerciseIds: ObjectId[] = [];
    const ejercicios: ExerciseDoc[] = [];
    for (let i = 0; i < POR_ORG.exercises; i += 1) {
      const id = new ObjectId();
      exerciseIds.push(id);
      ejercicios.push({
        _id: id,
        scope: 'org' as const,
        orgId,
        ownerUserId: null,
        name: `Ejercicio ${i}`,
        type: (i % 4 === 0 ? 'reps' : 'weight'),
        createdAt: desde,
        updatedAt: desde,
      });
    }
    await exercises().insertMany(ejercicios, { ordered: false });
    docs += ejercicios.length;

    // Grilla: sesiones repartidas en la ventana, con ocupación variable.
    const sessionIds: ObjectId[] = [];
    const sesiones = [];
    const totalSesiones = Math.round((POR_ORG.sessionsPerWeek * dias) / 7);
    for (let i = 0; i < totalSesiones; i += 1) {
      const id = new ObjectId();
      sessionIds.push(id);
      const startsAt = enVentana();
      const capacity = 12 + Math.floor(rand() * 8);
      sesiones.push({
        _id: id,
        orgId,
        templateId: null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        discipline: DISCIPLINAS[i % DISCIPLINAS.length] as string,
        capacity,
        bookedCount: Math.floor(rand() * capacity),
        status: 'scheduled' as const,
        createdAt: desde,
        updatedAt: desde,
      });
    }
    await classSessions().insertMany(sesiones, { ordered: false });
    docs += sesiones.length;

    // Packs asignados: uno por atleta, con vencimientos repartidos.
    const asignaciones = userIds.map((userId, i) => {
      const startsAt = enVentana();
      const precio = i % 3 === 0 ? 32_000 : 25_000;
      return {
        _id: new ObjectId(),
        orgId,
        userId,
        packId: new ObjectId(),
        snapshot: {
          name: i % 3 === 0 ? 'Pack 12' : 'Pack 8',
          classCount: i % 3 === 0 ? 12 : 8,
          durationDays: 30,
          price: precio,
          currency: 'ARS' as const,
          paymentMethod: 'cash' as const,
        },
        startsAt,
        // Repartidos alrededor de hoy: parte ya venció, parte vence pronto.
        expiresAt: new Date(now.getTime() + (rand() * 40 - 20) * DIA_MS),
        classesUsed: Math.floor(rand() * 8),
        status: 'active' as const,
        payment: { amount: precio, method: 'cash' as const, paidAt: startsAt },
        createdAt: startsAt,
        updatedAt: startsAt,
      };
    });
    await packAssignments().insertMany(asignaciones, { ordered: false });
    docs += asignaciones.length;

    // Reservas y cargas: el grueso del volumen.
    const totalReservas = Math.round(POR_ORG.bookingsPerMonth * opts.months);
    const reservas: BookingDoc[] = [];
    // RN-07: una reserva activa por sesión+usuario, con índice único parcial
    // detrás. El generador respeta la regla en vez de desactivarla — datos que
    // la base no aceptaría no sirven para medir nada.
    const ocupados = new Set<string>();
    for (let i = 0; i < totalReservas; i += 1) {
      const sessionId = sessionIds[i % sessionIds.length] as ObjectId;
      let u = i % userIds.length;
      for (let intento = 0; intento < userIds.length; intento += 1) {
        if (!ocupados.has(`${sessionId.toHexString()}:${u}`)) break;
        u = (u + 1) % userIds.length;
      }
      ocupados.add(`${sessionId.toHexString()}:${u}`);

      const bookedAt = enVentana();
      const cancelada = rand() < 0.1;
      reservas.push({
        _id: new ObjectId(),
        orgId,
        sessionId,
        userId: userIds[u] as ObjectId,
        packAssignmentId: asignaciones[i % asignaciones.length]?._id as ObjectId,
        status: (cancelada ? 'cancelled_by_user' : 'booked'),
        bookedAt,
        ...(cancelada ? { cancelledAt: new Date(bookedAt.getTime() + DIA_MS) } : {}),
      });
    }
    await insertChunked(bookings(), reservas);
    docs += reservas.length;

    const totalEntries = Math.round(POR_ORG.entriesPerMonth * opts.months);
    const cargas = [];
    for (let i = 0; i < totalEntries; i += 1) {
      cargas.push({
        _id: new ObjectId(),
        exerciseId: exerciseIds[i % exerciseIds.length] as ObjectId,
        userId: userIds[i % userIds.length] as ObjectId,
        orgId,
        kg: 40 + Math.floor(rand() * 120),
        date: new Date(desde.getTime() + rand() * dias * DIA_MS).toISOString().slice(0, 10),
        createdAt: desde,
      });
    }
    await insertChunked(rmEntries(), cargas);
    docs += cargas.length;
  }

  return { orgIds, docs, ms: Date.now() - t0 };
}

/** Lotes de 5k: `insertMany` con 100k docs se pasa del límite de mensaje. */
async function insertChunked<T>(
  col: { insertMany: (docs: T[], opts: { ordered: boolean }) => Promise<unknown> },
  docs: T[],
): Promise<void> {
  for (let i = 0; i < docs.length; i += 5_000) {
    await col.insertMany(docs.slice(i, i + 5_000), { ordered: false });
  }
}
