import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { closeMongo, initMongo } from '../db/client.js';
import { ensureIndexes } from '../db/indexes.js';

let replSet: MongoMemoryReplSet | null = null;

/**
 * Harness de integración (docs/08-testing.md §1): Mongo real en memoria como
 * replica set de 1 nodo — habilita transacciones. DB con nombre aleatorio por
 * suite para aislar. Uso:
 *   beforeAll(startTestDb); afterAll(stopTestDb);
 */
export async function startTestDb(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await initMongo(replSet.getUri(), `test-${randomUUID().slice(0, 8)}`);
  await ensureIndexes(db);
}

export async function stopTestDb(): Promise<void> {
  await closeMongo();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}
