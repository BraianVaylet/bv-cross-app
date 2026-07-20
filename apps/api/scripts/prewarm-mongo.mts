import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Descarga el binario de mongod UNA vez, en un solo proceso, antes de que
 * las suites de test arranquen en paralelo. Sin esto, varios workers de
 * vitest intentan bajar el mismo binario a la caché compartida a la vez y
 * se pisan el lockfile en CI (UnableToUnlockLockfileError / ENOENT al
 * renombrar el .tgz.downloading). Correrlo secuencial deja el binario en
 * caché y las suites lo encuentran ya listo.
 */
const server = await MongoMemoryServer.create();
await server.stop();
console.log('binario de mongod listo en caché');
