import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PackAssignmentStatus } from '@bv/contracts';
import { packAssignments } from '../db/collections.js';
import type { PackAssignmentDoc } from '../db/types.js';
import { startTestDb, stopTestDb } from '../test/mongo.js';
import { expirePacksJob } from './expire-packs.js';

const DAY_MS = 86_400_000;

function assignment(status: PackAssignmentStatus, expiresAt: Date): PackAssignmentDoc {
  const past = new Date(Date.now() - 15 * DAY_MS);
  return {
    _id: new ObjectId(),
    orgId: new ObjectId(),
    userId: new ObjectId(),
    packId: new ObjectId(),
    snapshot: {
      name: 'Pack 8 clases',
      classCount: 8,
      durationDays: 30,
      price: 25_000,
      currency: 'ARS',
      paymentMethod: 'cash',
    },
    startsAt: past,
    expiresAt,
    classesUsed: 2,
    status,
    payment: { amount: 25_000, method: 'cash', paidAt: past },
    createdAt: past,
    updatedAt: past,
  };
}

describe('expire-packs (F1-10)', () => {
  beforeAll(startTestDb, 120_000);
  afterAll(stopTestDb);
  beforeEach(async () => {
    await packAssignments().deleteMany({});
  });

  it('caso 1: active con expiresAt ayer → expired, updatedAt actualizado', async () => {
    const doc = assignment('active', new Date(Date.now() - DAY_MS));
    await packAssignments().insertOne(doc);

    const result = await expirePacksJob.run();

    expect(result.modified).toBe(1);
    const after = await packAssignments().findOne({ _id: doc._id });
    expect(after?.status).toBe('expired');
    expect(after?.updatedAt.getTime()).toBeGreaterThan(doc.updatedAt.getTime());
  });

  it('caso 2: active que vence mañana → intacto', async () => {
    const doc = assignment('active', new Date(Date.now() + DAY_MS));
    await packAssignments().insertOne(doc);

    const result = await expirePacksJob.run();

    expect(result.modified).toBe(0);
    const after = await packAssignments().findOne({ _id: doc._id });
    expect(after?.status).toBe('active');
    expect(after?.updatedAt.getTime()).toBe(doc.updatedAt.getTime());
  });

  it('caso 3: cancelled con fecha pasada → intacto (solo transiciona active)', async () => {
    const doc = assignment('cancelled', new Date(Date.now() - DAY_MS));
    await packAssignments().insertOne(doc);

    const result = await expirePacksJob.run();

    expect(result.modified).toBe(0);
    const after = await packAssignments().findOne({ _id: doc._id });
    expect(after?.status).toBe('cancelled');
  });

  it('caso 4: doble corrida consecutiva → la segunda reporta 0 modificados', async () => {
    await packAssignments().insertOne(assignment('active', new Date(Date.now() - DAY_MS)));

    const first = await expirePacksJob.run();
    const second = await expirePacksJob.run();

    expect(first.modified).toBe(1);
    expect(second.modified).toBe(0);
  });
});
