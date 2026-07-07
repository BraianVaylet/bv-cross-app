import { PERMISSIONS, can, type PermissionAction } from '@bv/contracts';
import { Hono } from 'hono';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppEnv } from '../app.js';
import { memberships } from '../db/collections.js';
import { onError } from '../lib/errors.js';
import { issueAccessToken } from '../modules/auth/token-service.js';
import { startTestDb, stopTestDb } from '../test/mongo.js';
import { testConfig } from '../test/helpers.js';
import { requireAuth } from './auth.js';
import { requireRole } from './roles.js';
import { tenantGuard } from './tenant.js';

const config = testConfig();

/** App mínima con el trío completo para probar la cadena real. */
function buildApp(action?: PermissionAction) {
  const app = new Hono<AppEnv>();
  app.use('/probe', requireAuth(config));
  app.use('/probe', tenantGuard());
  if (action) app.use('/probe', requireRole(action));
  app.get('/probe', (c) => c.json({ userId: c.get('userId'), org: c.get('org') }));
  app.onError(onError);
  return app;
}

const USER_ID = new ObjectId();
const ORG_ACTIVE = new ObjectId();
const ORG_DISABLED = new ObjectId();
const ORG_INVITED = new ObjectId();

async function probe(app: Hono<AppEnv>, orgId?: string, token?: string) {
  const auth = token ?? (await issueAccessToken(USER_ID.toHexString(), config));
  return app.request('/probe', {
    headers: {
      authorization: `Bearer ${auth}`,
      ...(orgId !== undefined ? { 'x-org-id': orgId } : {}),
    },
  });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

beforeAll(async () => {
  await startTestDb();
  const now = new Date();
  const base = { userId: USER_ID, profile: {}, createdAt: now, updatedAt: now };
  await memberships().insertMany([
    { _id: new ObjectId(), orgId: ORG_ACTIVE, role: 'admin', status: 'active', ...base },
    { _id: new ObjectId(), orgId: ORG_DISABLED, role: 'athlete', status: 'disabled', ...base },
    { _id: new ObjectId(), orgId: ORG_INVITED, role: 'athlete', status: 'invited', ...base },
  ]);
}, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

describe('tenantGuard', () => {
  const app = buildApp();

  it('sin X-Org-Id → 400 ORG_HEADER_MISSING; malformado → 400 VALIDATION_ERROR', async () => {
    const missing = await probe(app);
    expect(missing.status).toBe(400);
    expect(await errorCode(missing)).toBe('ORG_HEADER_MISSING');
    const bad = await probe(app, 'no-es-objectid');
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe('VALIDATION_ERROR');
  });

  it('org inexistente / disabled / invited → mismo 403 NOT_A_MEMBER (RN-03, sin oráculo)', async () => {
    for (const orgId of [new ObjectId().toHexString(), ORG_DISABLED.toHexString(), ORG_INVITED.toHexString()]) {
      const res = await probe(app, orgId);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe('NOT_A_MEMBER');
    }
  });

  it('membresía activa → pasa con org completa en contexto', async () => {
    const res = await probe(app, ORG_ACTIVE.toHexString());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { org: { orgId: string; role: string } };
    expect(body.org.orgId).toBe(ORG_ACTIVE.toHexString());
    expect(body.org.role).toBe('admin');
  });
});

describe('requireAuth', () => {
  it('firma inválida → 401 TOKEN_INVALID', async () => {
    const app = buildApp();
    const res = await probe(app, ORG_ACTIVE.toHexString(), 'ni.siquiera.jwt');
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('TOKEN_INVALID');
  });
});

describe('requireRole (matriz PERMISSIONS)', () => {
  it('admin sobre org:settings (solo owner) → 403; sobre members:manage → 200', async () => {
    const forbidden = await probe(buildApp('org:settings'), ORG_ACTIVE.toHexString());
    expect(forbidden.status).toBe(403);
    expect(await errorCode(forbidden)).toBe('FORBIDDEN_ROLE');
    const ok = await probe(buildApp('members:manage'), ORG_ACTIVE.toHexString());
    expect(ok.status).toBe(200);
  });

  it('owner puede TODAS las acciones de la matriz; athlete ninguna de gestión', () => {
    for (const action of Object.keys(PERMISSIONS) as PermissionAction[]) {
      expect(can('owner', action)).toBe(true);
      expect(can('athlete', action)).toBe(false);
    }
  });
});
