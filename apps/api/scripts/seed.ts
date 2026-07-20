import { loadConfig } from '../src/config.js';
import { closeMongo, initMongo } from '../src/db/client.js';
import { ensureIndexes } from '../src/db/indexes.js';
import { logger } from '../src/lib/logger.js';
import { runSeed } from '../src/seed.js';

// CLI: pnpm --filter @bv/api db:seed
// URI por env (Mongo local o Atlas dev). Carga .env si existe.
try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: las vars vienen del shell
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await initMongo(config.MONGODB_URI);
  await ensureIndexes(db);
  await runSeed(config.NODE_ENV);
  await closeMongo();
}

main().catch((err: unknown) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
