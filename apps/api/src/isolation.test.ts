import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ROUTE_POLICIES, type Access, type RoutePolicy } from './route-policies.js';
import {
  makeMembership,
  makeOrg,
  makeUser,
  RESOURCE_FACTORIES,
  type TestUser,
} from './test/factories.js';
import { startTestDb, stopTestDb } from './test/mongo.js';
import { testConfig } from './test/helpers.js';

/**
 * Suite de aislamiento multi-tenant (docs/tasks/F1.md F1-09, Testing §5).
 * Infraestructura permanente: garantiza que ninguna ruta —presente o futura—
 * filtra datos entre orgs ni saltea la matriz de roles. Cómo registrar una
 * ruta o agregar una factory: ver test/README.md.
 */

const config = testConfig();
const app = createApp(config);

const ORG_SCOPED: Access[] = ['member', 'admin', 'owner'];

// Setup compartido (una vez): dos orgs y el elenco de la matriz.
let orgA: ObjectId;
let orgB: ObjectId;
let ownerA: TestUser;
let adminA: TestUser;
let athleteA: TestUser;
let athleteB: TestUser;
let outsider: TestUser;
let disabledA: TestUser;

const DUMMY_ID = new ObjectId().toHexString();

function urlFor(policy: RoutePolicy, id = DUMMY_ID): string {
  return policy.path.replace(':id', id);
}

interface CallOpts {
  token?: string;
  orgId?: string;
  id?: string;
}

async function call(policy: RoutePolicy, opts: CallOpts): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.orgId) headers['x-org-id'] = opts.orgId;
  const hasBody = policy.method !== 'GET';
  return app.request(urlFor(policy, opts.id), {
    method: policy.method,
    headers,
    ...(hasBody ? { body: JSON.stringify(policy.sampleBody ?? {}) } : {}),
  });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

beforeAll(async () => {
  await startTestDb();
  orgA = await makeOrg('Org A');
  orgB = await makeOrg('Org B');
  ownerA = await makeUser(config, 'owner-a@iso.test');
  adminA = await makeUser(config, 'admin-a@iso.test');
  athleteA = await makeUser(config, 'athlete-a@iso.test');
  athleteB = await makeUser(config, 'athlete-b@iso.test');
  outsider = await makeUser(config, 'outsider@iso.test');
  disabledA = await makeUser(config, 'disabled-a@iso.test');

  await makeMembership(orgA, ownerA.id, 'owner');
  await makeMembership(orgA, adminA.id, 'admin');
  await makeMembership(orgA, athleteA.id, 'athlete');
  await makeMembership(orgB, athleteB.id, 'athlete');
  await makeMembership(orgA, disabledA.id, 'athlete', 'disabled');
}, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

// ── Test 1 — completitud: toda ruta ↔ exactamente una política ──────────────
describe('Test 1 — completitud del registro', () => {
  it('cada ruta /api/v1 tiene política y cada política tiene ruta', () => {
    const registered = new Set<string>();
    for (const r of app.routes) {
      if (r.method === 'ALL') continue; // entradas de use() (middleware), no handlers
      if (!r.path.startsWith('/api/v1')) continue;
      registered.add(`${r.method} ${r.path}`);
    }
    const declared = new Set(ROUTE_POLICIES.map((p) => `${p.method} ${p.path}`));

    const sinPolitica = [...registered].filter((r) => !declared.has(r));
    const huerfanas = [...declared].filter((p) => !registered.has(p));

    expect(sinPolitica, `Rutas sin política — registralas en route-policies.ts:\n${sinPolitica.join('\n')}`).toEqual([]);
    expect(huerfanas, `Políticas sin ruta (¿ruta renombrada/borrada?):\n${huerfanas.join('\n')}`).toEqual([]);
    // Sin duplicados: una ruta = una política.
    expect(ROUTE_POLICIES.length).toBe(new Set(ROUTE_POLICIES.map((p) => `${p.method} ${p.path}`)).size);
  });
});

// ── Test 2 — matriz de acceso ───────────────────────────────────────────────
const orgScopedPolicies = ROUTE_POLICIES.filter((p) => ORG_SCOPED.includes(p.access));
const userPolicies = ROUTE_POLICIES.filter((p) => p.access === 'user');

describe('Test 2 — matriz de acceso', () => {
  describe.each(userPolicies.map((p) => [`${p.method} ${p.path}`, p] as const))(
    'user · %s',
    (_label, policy) => {
      it('sin token → 401', async () => {
        const res = await call(policy, {});
        expect(res.status).toBe(401);
      });
    },
  );

  describe.each(orgScopedPolicies.map((p) => [`${p.method} ${p.path} (${p.access})`, p] as const))(
    'org-scoped · %s',
    (_label, policy) => {
      it('sin token → 401', async () => {
        expect((await call(policy, {})).status).toBe(401);
      });

      it('outsider (sin orgs) con X-Org-Id: A → 403 NOT_A_MEMBER', async () => {
        const res = await call(policy, { token: outsider.token, orgId: orgA.toHexString() });
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('NOT_A_MEMBER');
      });

      it('miembro disabled en A → 403 NOT_A_MEMBER', async () => {
        const res = await call(policy, { token: disabledA.token, orgId: orgA.toHexString() });
        expect(res.status).toBe(403);
        expect(await errorCode(res)).toBe('NOT_A_MEMBER');
      });

      if (policy.access === 'admin' || policy.access === 'owner') {
        it('athleteA (rol insuficiente) → 403 FORBIDDEN_ROLE', async () => {
          const res = await call(policy, { token: athleteA.token, orgId: orgA.toHexString() });
          expect(res.status).toBe(403);
          expect(await errorCode(res)).toBe('FORBIDDEN_ROLE');
        });
      }

      if (policy.access === 'owner') {
        it('adminA sobre ruta owner-only → 403 FORBIDDEN_ROLE', async () => {
          const res = await call(policy, { token: adminA.token, orgId: orgA.toHexString() });
          expect(res.status).toBe(403);
          expect(await errorCode(res)).toBe('FORBIDDEN_ROLE');
        });
      }

      if (policy.access === 'member') {
        it('athleteA (miembro activo) NO recibe 403 de authz', async () => {
          const res = await call(policy, { token: athleteA.token, orgId: orgA.toHexString() });
          expect(res.status).not.toBe(403);
        });
      }
    },
  );
});

// ── Test 3 — IDOR cross-org: :id de otra org → 404 (no revelar existencia) ───
const resourcePolicies = ROUTE_POLICIES.filter((p) => p.resource !== undefined);

describe('Test 3 — IDOR cross-org', () => {
  describe.each(resourcePolicies.map((p) => [`${p.method} ${p.path}`, p] as const))(
    '%s',
    (_label, policy) => {
      it('adminA con X-Org-Id: A y un :id de la org B → 404', async () => {
        const resource = policy.resource;
        if (resource === undefined) throw new Error('política sin resource en el test de IDOR');
        const foreignId = await RESOURCE_FACTORIES[resource](orgB);
        const res = await call(policy, {
          token: adminA.token,
          orgId: orgA.toHexString(),
          id: foreignId,
        });
        expect(res.status).toBe(404);
      });
    },
  );

  it('control positivo: el mismo recurso en la org propia responde (no 404 por authz)', async () => {
    const ownId = await RESOURCE_FACTORIES.membership(orgA);
    const res = await call(
      { method: 'GET', path: '/api/v1/members/:id', access: 'admin', resource: 'membership' },
      { token: adminA.token, orgId: orgA.toHexString(), id: ownId },
    );
    expect(res.status).toBe(200);
  });
});
