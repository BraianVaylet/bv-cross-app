import { logger } from '../lib/logger.js';
import { listActiveOrgs, listActiveTemplatesForJob } from '../modules/schedule/schedule.repo.js';
import { materializeTemplate } from '../modules/schedule/schedule.service.js';
import type { Job } from './scheduler.js';

/**
 * Materializa las sesiones futuras de cada org activa hasta su horizonte
 * (`settings.sessionGenerationDays`), en la timezone de la org (RN-05, DEC-09).
 *
 * Idempotente por el índice único {templateId, startsAt}: correrlo N veces —o
 * en N réplicas— no duplica. Los templates inactivos no materializan, pero sus
 * sesiones ya creadas se conservan.
 */
export const materializeSessionsJob: Job = {
  name: 'materialize-sessions',
  schedule: '0 * * * *',
  run: async () => {
    const orgs = await listActiveOrgs();
    const now = new Date();
    let created = 0;

    for (const org of orgs) {
      const templates = await listActiveTemplatesForJob(org._id);
      let perOrg = 0;
      for (const template of templates) {
        perOrg += await materializeTemplate(org._id, template, now);
      }
      created += perOrg;
      if (perOrg > 0) {
        logger.info(
          { job: 'materialize-sessions', orgId: org._id.toHexString(), created: perOrg },
          'sesiones materializadas',
        );
      }
    }

    return { modified: created };
  },
};
