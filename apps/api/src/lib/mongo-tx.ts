import { MongoError, type ClientSession, type TransactionOptions } from 'mongodb';
import { getClient } from '../db/client.js';
import { logger } from './logger.js';

/**
 * Transacciones de dominio (docs/02-arquitectura.md §6).
 *
 * `snapshot` para que todas las lecturas de la transacción vean el mismo
 * estado, `majority` para que un commit confirmado sobreviva a un failover:
 * acá se mueven créditos de gente que pagó, no se negocia la durabilidad.
 */
const TX_OPTIONS: TransactionOptions = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  readPreference: 'primary',
};

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 15;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reintentables: los dos labels que el servidor usa para decir "volvé a
 * intentar, no pasó nada" — conflicto de escritura entre transacciones
 * concurrentes y commit de resultado desconocido (failover en el medio).
 */
const isRetryable = (err: unknown): boolean =>
  err instanceof MongoError &&
  (err.hasErrorLabel('TransientTransactionError') ||
    err.hasErrorLabel('UnknownTransactionCommitResult'));

/**
 * Corre `fn` dentro de una transacción y la reintenta hasta 3 veces ante un
 * error transitorio, con backoff corto y creciente.
 *
 * El driver ya reintenta los transitorios por su cuenta, pero sin tope de
 * intentos (solo un timeout de 120 s): este wrapper acota el reintento y deja
 * traza de cada uno. Un `DomainError` lanzado adentro NO se reintenta —
 * abortar es justamente lo que se quiere (rollback de los `$inc` previos).
 */
export async function withTransaction<T>(
  name: string,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const session = getClient().startSession();
    try {
      return await session.withTransaction(() => fn(session), TX_OPTIONS);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastErr = err;
      logger.warn({ tx: name, attempt, err }, 'transacción transitoria: reintento');
    } finally {
      await session.endSession();
    }
    await sleep(BACKOFF_MS * attempt);
  }
  logger.error({ tx: name, attempts: MAX_ATTEMPTS, err: lastErr }, 'transacción agotó los reintentos');
  throw lastErr;
}
