import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { testConfig } from '../test/helpers.js';
import { startTestDb, stopTestDb } from '../test/mongo.js';
import { getClient, getDb } from './client.js';
import { bookings, memberships, users } from './collections.js';
import { ensureIndexes } from './indexes.js';

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

const now = () => new Date();

function userDoc(email: string) {
  return {
    _id: new ObjectId(),
    email,
    emailVerifiedAt: null,
    name: 'Test',
    passwordHash: 'x',
    createdAt: now(),
    updatedAt: now(),
  };
}

describe('ensureIndexes', () => {
  it('is idempotent (second run adds nothing and does not throw)', async () => {
    await ensureIndexes(getDb());
    await ensureIndexes(getDb());
    const idx = await users().indexes();
    // _id + email únicos, sin duplicados
    expect(idx.filter((i) => i.name !== '_id_')).toHaveLength(1);
  });

  it('TTL indexes are configured with expireAfterSeconds 0', async () => {
    const idx = await getDb().collection('refreshTokens').indexes();
    const ttl = idx.find((i) => 'expiresAt' in (i.key as object));
    expect(ttl?.expireAfterSeconds).toBe(0);
  });
});

describe('unique constraints', () => {
  it('rejects duplicate user email (E11000)', async () => {
    await users().insertOne(userDoc('dup@test.com'));
    await expect(users().insertOne(userDoc('dup@test.com'))).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('bookings partial unique: two booked collide, cancelled does not (RN-07)', async () => {
    const base = {
      orgId: new ObjectId(),
      sessionId: new ObjectId(),
      userId: new ObjectId(),
      packAssignmentId: new ObjectId(),
      bookedAt: now(),
    };
    await bookings().insertOne({ _id: new ObjectId(), ...base, status: 'booked' });
    await expect(
      bookings().insertOne({ _id: new ObjectId(), ...base, status: 'booked' }),
    ).rejects.toMatchObject({ code: 11000 });
    // Misma sesión+usuario pero cancelada: permitida (índice parcial)
    await expect(
      bookings().insertOne({ _id: new ObjectId(), ...base, status: 'cancelled_by_user' }),
    ).resolves.toBeTruthy();
  });

  it('memberships partial unique ignores invited pre-loads with null userId (RN-02)', async () => {
    const orgId = new ObjectId();
    const invited = () => ({
      _id: new ObjectId(),
      orgId,
      userId: null,
      role: 'athlete' as const,
      status: 'invited' as const,
      profile: {},
      createdAt: now(),
      updatedAt: now(),
    });
    // Dos pre-cargas sin userId en la misma org: no chocan entre sí
    await memberships().insertOne(invited());
    await expect(memberships().insertOne(invited())).resolves.toBeTruthy();
    // Pero el mismo userId real dos veces sí choca
    const userId = new ObjectId();
    await memberships().insertOne({ ...invited(), userId, status: 'active' });
    await expect(
      memberships().insertOne({ ...invited(), userId, status: 'active' }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('transactions (replica set)', () => {
  it('aborted transaction leaves no writes visible', async () => {
    const session = getClient().startSession();
    const email = 'tx-abort@test.com';
    try {
      await expect(
        session.withTransaction(async () => {
          await users().insertOne(userDoc(email), { session });
          throw new Error('forzar rollback');
        }),
      ).rejects.toThrow('forzar rollback');
    } finally {
      await session.endSession();
    }
    expect(await users().findOne({ email })).toBeNull();
  });
});

describe('healthz with real mongo', () => {
  it('reports ok when connected', async () => {
    const app = createApp(testConfig());
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mongo).toBe('ok');
  });
});
