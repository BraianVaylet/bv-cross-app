import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { closeMongo, initMongo } from '../src/db/client.js';
import { ensureIndexes } from '../src/db/indexes.js';
import { logger } from '../src/lib/logger.js';
import { rollbackMigration, runMigration } from '../src/migrate-v1.js';

// CLI: pnpm --filter @bv/api db:migrate-v1 -- --sqlite <path> --email <email> --name <nombre> [--commit]
// Rollback:                                 -- --rollback <userId>
// Dry-run por defecto: imprime el plan sin escribir nada.
try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: las vars vienen del shell
}

const { values } = parseArgs({
  // pnpm reenvía el separador `--` como argumento: parseArgs lo tomaría como posicional.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    sqlite: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    alias: { type: 'string' },
    'link-user': { type: 'string' },
    commit: { type: 'boolean', default: false },
    rollback: { type: 'string' },
  },
});

function usage(): never {
  console.error(
    [
      'Uso:',
      '  db:migrate-v1 -- --sqlite <path.db> --email <email> --name <nombre> [--alias <alias>] [--link-user <id>] [--commit]',
      '  db:migrate-v1 -- --rollback <userId>',
      '',
      'Sin --commit hace dry-run: imprime el plan y no escribe nada.',
    ].join('\n'),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await initMongo(config.MONGODB_URI);
  await ensureIndexes(db);

  if (values.rollback) {
    await rollbackMigration(values.rollback);
    console.log(`Rollback OK: usuario ${values.rollback} y todos sus ejercicios/registros borrados.`);
    await closeMongo();
    return;
  }

  if (!values.sqlite || !values.email || !values.name) usage();

  const result = await runMigration({
    sqlitePath: values.sqlite,
    email: values.email,
    name: values.name,
    commit: values.commit,
    ...(values.alias ? { alias: values.alias } : {}),
    ...(values['link-user'] ? { linkUserId: values['link-user'] } : {}),
  });

  const { plan } = result;
  console.log('');
  console.log(result.committed ? '=== MIGRACIÓN EJECUTADA ===' : '=== DRY-RUN (sin escrituras) ===');
  console.log(`Destino: ${plan.target.kind === 'new-user' ? 'usuario nuevo' : `usuario existente ${plan.target.userId ?? ''}`} · ${plan.target.email}`);
  console.log(`v1: ${plan.v1Counts.exercises} ejercicios · ${plan.v1Counts.entries} registros`);
  console.log(`A migrar: ${plan.willMigrate.exercises} ejercicios · ${plan.willMigrate.entries} registros`);

  if (plan.excluded.length > 0) {
    console.log(`\nExcluidos (${plan.excluded.length}) — datos sucios en v1:`);
    for (const e of plan.excluded) console.log(`  - entry #${e.id}: ${e.reason}`);
  }

  if (result.verification) {
    const v = result.verification;
    console.log('\nVerificación post-commit:');
    console.log(`  ejercicios v1=${v.exercisesV1} → v2=${v.exercisesV2} ${v.exercisesV1 === v.exercisesV2 ? 'OK' : 'DIFIERE'}`);
    console.log(`  registros  v1=${v.entriesV1} → v2=${v.entriesV2} ${v.entriesV1 === v.entriesV2 ? 'OK' : 'DIFIERE'}`);
    console.log('  RM vigente (spot-check):');
    for (const s of v.currentRmSpotCheck) {
      console.log(`    - ${s.exercise}: ${s.measure} del ${s.date} ${s.ok ? 'OK' : 'DIFIERE'}`);
    }
  }

  if (result.committed && plan.target.kind === 'new-user') {
    console.log(
      '\nEl usuario se creó con una password aleatoria (no se muestra): pedile al dueño que use "olvidé mi contraseña" para definir la suya.',
    );
  }
  if (!result.committed) console.log('\nRepetí con --commit para ejecutar.');

  await closeMongo();
}

main().catch((err: unknown) => {
  logger.error({ err }, 'migrate-v1 failed');
  console.error(`\nERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
