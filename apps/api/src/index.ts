import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { closeMongo, initMongo } from './db/client.js';
import { ensureIndexes } from './db/indexes.js';
import { expirePacksJob } from './jobs/expire-packs.js';
import { startScheduler, type Scheduler } from './jobs/scheduler.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message); // el logger puede no estar operativo sin config
      process.exit(1);
    }
    throw err;
  }

  const db = await initMongo(config.MONGODB_URI);
  await ensureIndexes(db);

  const app = createApp(config);
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port, env: config.NODE_ENV }, 'api listening');
  });

  let scheduler: Scheduler | null = null;
  if (config.ENABLE_JOBS) {
    scheduler = startScheduler([expirePacksJob]);
  }

  // Cierre limpio: dejar de aceptar conexiones, cerrar Mongo y salir.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    scheduler?.stop();
    server.close(() => {
      void closeMongo().finally(() => {
        process.exit(0);
      });
    });
  };
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, 'fatal boot error');
  process.exit(1);
});
