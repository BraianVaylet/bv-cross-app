import { MongoClient, type Db } from 'mongodb';
import { logger } from '../lib/logger.js';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Conexión Mongo singleton (docs/02-arquitectura.md, DEC-02).
 * Falla rápido si el server no responde (serverSelectionTimeoutMS).
 */
export async function initMongo(uri: string, dbName?: string): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    retryWrites: true,
    writeConcern: { w: 'majority' },
  });
  await client.connect();
  db = client.db(dbName); // sin dbName usa el de la URI
  await db.command({ ping: 1 });
  logger.info({ db: db.databaseName }, 'mongo connected');
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Mongo no inicializado: llamá initMongo() en el boot.');
  return db;
}

export function getClient(): MongoClient {
  if (!client) throw new Error('Mongo no inicializado: llamá initMongo() en el boot.');
  return client;
}

/** true si la DB responde al ping (para /healthz). */
export async function pingMongo(): Promise<boolean> {
  if (!db) return false;
  try {
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
