import { loadConfig } from '../src/config.js';
import { closeMongo, initMongo } from '../src/db/client.js';
import { ensureIndexes } from '../src/db/indexes.js';
import { logger } from '../src/lib/logger.js';
import { generateLoad } from '../src/test/loadgen.js';

/**
 * CLI del generador de carga (F3-10). El generador está en
 * `src/test/loadgen.ts`: el test de presupuesto importa el mismo código, así
 * que la medición de CI y la de la máquina de uno son sobre los mismos datos.
 *
 *   pnpm --filter @bv/api loadgen -- --orgs=100 --months=3
 *
 * NO se corre contra producción: aborta igual que el seed.
 */

function arg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const n = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: las vars vienen del shell
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    throw new Error('loadgen está prohibido en producción.');
  }
  const db = await initMongo(config.MONGODB_URI);
  await ensureIndexes(db);

  const orgs = arg('orgs', 100);
  const months = arg('months', 3);
  logger.info({ orgs, months }, 'loadgen: generando');
  const res = await generateLoad({ orgs, months });
  logger.info(
    {
      orgs,
      months,
      docs: res.docs,
      ms: res.ms,
      docsPorSegundo: Math.round(res.docs / (res.ms / 1000)),
      primerOrgId: res.orgIds[0]?.toHexString(),
    },
    'loadgen: listo — usar primerOrgId para medir',
  );
  await closeMongo();
}

main().catch((err: unknown) => {
  logger.error({ err }, 'loadgen failed');
  process.exit(1);
});
