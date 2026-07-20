import { schedule, type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';

export interface JobResult {
  /** Documentos modificados por la corrida (para el log uniforme). */
  modified?: number;
}

export interface Job {
  name: string;
  /** Expresión cron de 5 campos: min hora díaMes mes díaSemana. */
  schedule: string;
  run: () => Promise<JobResult>;
}

/**
 * Wrapper estándar por job (DEC-09, docs/02-arquitectura.md §8):
 * - log inicio/fin con formato uniforme (`job`, `durationMs`, `modified`)
 * - try/catch: un job que explota se loguea como error, nunca tumba el proceso
 * - anti-solapamiento in-process: si la corrida anterior sigue viva, la nueva
 *   se saltea con warn. Los jobs son idempotentes, así que el solapamiento no
 *   corrompería — pero desperdicia y ensucia métricas.
 *
 * F3-01 registra `materialize-sessions` pasando otro `Job` a `startScheduler`
 * sin tocar este archivo.
 */
export function createJobRunner(job: Job): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      logger.warn({ job: job.name }, 'job skipped: previous run still in progress');
      return;
    }
    running = true;
    const start = performance.now();
    logger.info({ job: job.name }, 'job start');
    try {
      const result = await job.run();
      logger.info(
        {
          job: job.name,
          durationMs: Math.round(performance.now() - start),
          modified: result.modified ?? 0,
        },
        'job done',
      );
    } catch (err) {
      logger.error(
        { job: job.name, durationMs: Math.round(performance.now() - start), err },
        'job failed',
      );
    } finally {
      running = false;
    }
  };
}

export interface Scheduler {
  stop: () => void;
}

/** Registra los jobs en node-cron. index.ts lo llama solo si ENABLE_JOBS. */
export function startScheduler(jobs: Job[]): Scheduler {
  const tasks: ScheduledTask[] = jobs.map((job) => schedule(job.schedule, createJobRunner(job)));
  logger.info({ jobs: jobs.map((j) => j.name) }, 'scheduler started');
  return {
    stop: () => {
      for (const task of tasks) void task.stop();
    },
  };
}
