import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger.js';
import { createJobRunner, type Job } from './scheduler.js';

describe('scheduler — wrapper de jobs (F1-10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('caso 5: job que lanza excepción → el runner no propaga, error logueado', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const job: Job = {
      name: 'boom',
      schedule: '0 * * * *',
      run: () => Promise.reject(new Error('falló adentro')),
    };
    const runner = createJobRunner(job);

    await expect(runner()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload, msg] = errorSpy.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('job failed');
    expect(payload.job).toBe('boom');
    expect(payload.err).toBeInstanceOf(Error);
  });

  it('caso 6: solapamiento — corrida lenta viva + trigger nuevo → segunda se saltea con warn', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    let runs = 0;
    const job: Job = {
      name: 'slow',
      schedule: '0 * * * *',
      run: async () => {
        runs += 1;
        // corrida lenta simulada: 5 s de trabajo
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return { modified: 0 };
      },
    };
    const runner = createJobRunner(job);

    const first = runner(); // queda viva (timer pendiente)
    await runner(); // trigger mientras la anterior corre

    expect(runs).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      { job: 'slow' },
      'job skipped: previous run still in progress',
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await first;

    // liberado el flag, una corrida nueva vuelve a ejecutar
    const again = runner();
    await vi.advanceTimersByTimeAsync(5_000);
    await again;
    expect(runs).toBe(2);
  });

  it('logs con formato uniforme: job, durationMs, modified', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    const job: Job = {
      name: 'ok',
      schedule: '0 * * * *',
      run: () => Promise.resolve({ modified: 3 }),
    };

    await createJobRunner(job)();

    expect(infoSpy).toHaveBeenCalledWith({ job: 'ok' }, 'job start');
    const done = infoSpy.mock.calls.at(-1) as [Record<string, unknown>, string];
    expect(done[1]).toBe('job done');
    expect(done[0].job).toBe('ok');
    expect(typeof done[0].durationMs).toBe('number');
    expect(done[0].modified).toBe(3);
  });
});
