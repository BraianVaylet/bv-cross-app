import { packAssignments } from '../db/collections.js';
import type { Job } from './scheduler.js';

/**
 * RN-13/RN-18: un pack `active` cuya `expiresAt` ya pasó transiciona a
 * `expired`. Idempotente: el filtro por status hace que re-correr no toque
 * nada (docs/tasks/F1.md F1-10).
 *
 * Recordatorio arquitectónico (docs/02-arquitectura.md §8): la lectura NUNCA
 * confía en este job — todo consumidor de packs valida `expiresAt > now`
 * además del status. El job materializa el estado, no lo define.
 */
export const expirePacksJob: Job = {
  name: 'expire-packs',
  schedule: '0 * * * *',
  run: async () => {
    const res = await packAssignments().updateMany(
      { status: 'active', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired', updatedAt: new Date() } },
    );
    return { modified: res.modifiedCount };
  },
};
