import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { users } from '../../db/collections.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import { testConfig } from '../../test/helpers.js';
import { issueAccessToken } from '../auth/token-service.js';

const config = testConfig();
const app = createApp(config);

async function seedUser(email: string, name = 'Ana'): Promise<{ id: ObjectId; token: string }> {
  const now = new Date();
  const id = new ObjectId();
  await users().insertOne({
    _id: id,
    email,
    emailVerifiedAt: now,
    name,
    passwordHash: 'x',
    createdAt: now,
    updatedAt: now,
  });
  return { id, token: await issueAccessToken(id.toHexString(), config) };
}

function req(
  method: string,
  path: string,
  token: string,
  orgId?: string,
  body?: unknown,
) {
  return app.request(`/api/v1/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(orgId !== undefined ? { 'x-org-id': orgId } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Ctx {
  owner: { id: ObjectId; token: string };
  orgId: string;
  joinCode: string;
}

async function createOrgCtx(email: string, name: string): Promise<Ctx> {
  const owner = await seedUser(email);
  const res = await req('POST', 'orgs', owner.token, undefined, {
    name,
    timezone: 'America/Argentina/Buenos_Aires',
  });
  expect(res.status).toBe(201);
  const { org } = (await res.json()) as { org: { id: string; joinCode: string } };
  return { owner, orgId: org.id, joinCode: org.joinCode };
}

async function preload(ctx: Ctx, displayName: string, extra: Record<string, unknown> = {}) {
  const res = await req('POST', 'members', ctx.owner.token, ctx.orgId, {
    profile: { displayName },
    ...extra,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { member: { id: string } }).member;
}

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

describe('autorización', () => {
  it('athlete → 403 FORBIDDEN_ROLE en cualquier endpoint', async () => {
    const ctx = await createOrgCtx('own-a@test.com', 'Roles Gym');
    const athlete = await seedUser('ath-a@test.com');
    expect((await req('POST', 'orgs/join', athlete.token, undefined, { code: ctx.joinCode })).status).toBe(201);

    for (const [method, path, body] of [
      ['GET', 'members', undefined],
      ['POST', 'members', { profile: { displayName: 'X' } }],
      ['GET', `members/${new ObjectId().toHexString()}`, undefined],
      ['PATCH', `members/${new ObjectId().toHexString()}`, { adminNotes: 'x' }],
    ] as const) {
      const res = await req(method, path, athlete.token, ctx.orgId, body);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN_ROLE');
    }
  });

  it('cross-org: id de la org B consultado desde la org A → 404 (sin oráculo)', async () => {
    const a = await createOrgCtx('own-b@test.com', 'Org A');
    const b = await createOrgCtx('own-c@test.com', 'Org B');
    const foreign = await preload(b, 'Cliente B');
    const res = await req('GET', `members/${foreign.id}`, a.owner.token, a.orgId);
    expect(res.status).toBe(404);
  });
});

describe('pre-carga y vinculación', () => {
  it('invitedEmail duplicado en la org → 409; el mismo email en OTRA org → permitido', async () => {
    const ctx = await createOrgCtx('own-d@test.com', 'Dups Gym');
    await preload(ctx, 'Caro', { invitedEmail: 'caro@test.com' });
    const dup = await req('POST', 'members', ctx.owner.token, ctx.orgId, {
      profile: { displayName: 'Caro 2' },
      invitedEmail: 'caro@test.com',
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe('ALREADY_MEMBER');

    const other = await createOrgCtx('own-e@test.com', 'Otra Org');
    const ok = await req('POST', 'members', other.owner.token, other.orgId, {
      profile: { displayName: 'Caro' },
      invitedEmail: 'caro@test.com',
    });
    expect(ok.status).toBe(201);
  });

  it('email ya vinculado (miembro con cuenta) también → 409', async () => {
    const ctx = await createOrgCtx('own-f@test.com', 'Vinc Gym');
    const athlete = await seedUser('vinculada@test.com');
    expect((await req('POST', 'orgs/join', athlete.token, undefined, { code: ctx.joinCode })).status).toBe(201);
    const res = await req('POST', 'members', ctx.owner.token, ctx.orgId, {
      profile: { displayName: 'Duplicada' },
      invitedEmail: 'vinculada@test.com',
    });
    expect(res.status).toBe(409);
  });

  it('pre-carga + join → GET /members/:id muestra el user vinculado y conserva adminNotes', async () => {
    const ctx = await createOrgCtx('own-g@test.com', 'Link Gym');
    const member = await preload(ctx, 'Caro', {
      invitedEmail: 'link@test.com',
      adminNotes: 'lesión de rodilla',
    });

    const athlete = await seedUser('link@test.com', 'Carolina');
    expect((await req('POST', 'orgs/join', athlete.token, undefined, { code: ctx.joinCode })).status).toBe(201);

    const res = await req('GET', `members/${member.id}`, ctx.owner.token, ctx.orgId);
    expect(res.status).toBe(200);
    const dto = ((await res.json()) as {
      member: { status: string; adminNotes?: string; user?: { email: string; name: string } };
    }).member;
    expect(dto.status).toBe('active');
    expect(dto.adminNotes).toBe('lesión de rodilla');
    expect(dto.user?.email).toBe('link@test.com');
    expect(dto.user?.name).toBe('Carolina');
  });
});

describe('PATCH /members/:id', () => {
  it('owner no se puede deshabilitar (403); athlete deshabilitado pierde tenantGuard', async () => {
    const ctx = await createOrgCtx('own-h@test.com', 'Patch Gym');
    const athlete = await seedUser('ath-h@test.com');
    expect((await req('POST', 'orgs/join', athlete.token, undefined, { code: ctx.joinCode })).status).toBe(201);

    // buscar ids vía lista
    const listRes = await req('GET', 'members?limit=50', ctx.owner.token, ctx.orgId);
    const { items } = (await listRes.json()) as {
      items: { id: string; role: string; status: string }[];
    };
    const ownerRow = items.find((m) => m.role === 'owner');
    const athleteRow = items.find((m) => m.role === 'athlete');

    const noOwner = await req('PATCH', `members/${ownerRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      status: 'disabled',
    });
    expect(noOwner.status).toBe(403);
    expect(((await noOwner.json()) as { error: { code: string } }).error.code).toBe('CANNOT_MODIFY_OWNER');

    const disable = await req('PATCH', `members/${athleteRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      status: 'disabled',
      adminNotes: 'dejó de venir',
    });
    expect(disable.status).toBe(200);

    // RN-03: integración con tenantGuard (F1-06)
    const denied = await req('GET', 'orgs/current', athlete.token, ctx.orgId);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe('NOT_A_MEMBER');

    // reactivar permitido
    const enable = await req('PATCH', `members/${athleteRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      status: 'active',
    });
    expect(enable.status).toBe(200);
    expect((await req('GET', 'orgs/current', athlete.token, ctx.orgId)).status).toBe(200);
  });

  it('roles: el owner promueve y degrada; un admin no puede, y al owner no lo toca nadie (F3-11)', async () => {
    const ctx = await createOrgCtx('own-roles@test.com', 'Roles Gym');
    const ana = await seedUser('ana-roles@test.com');
    const beto = await seedUser('beto-roles@test.com');
    for (const u of [ana, beto]) {
      expect((await req('POST', 'orgs/join', u.token, undefined, { code: ctx.joinCode })).status).toBe(201);
    }

    const rows = async () =>
      ((await (await req('GET', 'members?limit=50', ctx.owner.token, ctx.orgId)).json()) as {
        items: { id: string; role: string; user?: { email: string } }[];
      }).items;

    const inicial = await rows();
    const ownerRow = inicial.find((m) => m.role === 'owner');
    const anaRow = inicial.find((m) => m.user?.email === 'ana-roles@test.com');
    const betoRow = inicial.find((m) => m.user?.email === 'beto-roles@test.com');

    // El owner promueve a Ana.
    const promote = await req('PATCH', `members/${anaRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      role: 'admin',
    });
    expect(promote.status).toBe(200);
    expect(((await promote.json()) as { member: { role: string } }).member.role).toBe('admin');

    // Ana ya es admin, pero repartir permisos sigue siendo del owner (RN-04).
    const porAdmin = await req('PATCH', `members/${betoRow?.id ?? ''}`, ana.token, ctx.orgId, {
      role: 'admin',
    });
    expect(porAdmin.status).toBe(403);
    expect(((await porAdmin.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN_ROLE');

    // Un admin sí puede seguir editando la ficha: solo el rol le está vedado.
    const notas = await req('PATCH', `members/${betoRow?.id ?? ''}`, ana.token, ctx.orgId, {
      adminNotes: 'entrena a la mañana',
    });
    expect(notas.status).toBe(200);

    // Degradar al owner no se puede: la org se quedaría sin dueño.
    const degradarOwner = await req('PATCH', `members/${ownerRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      role: 'athlete',
    });
    expect(degradarOwner.status).toBe(403);
    expect(((await degradarOwner.json()) as { error: { code: string } }).error.code).toBe(
      'CANNOT_MODIFY_OWNER',
    );

    // Y el owner puede devolver a Ana a atleta.
    const demote = await req('PATCH', `members/${anaRow?.id ?? ''}`, ctx.owner.token, ctx.orgId, {
      role: 'athlete',
    });
    expect(demote.status).toBe(200);
    expect(((await demote.json()) as { member: { role: string } }).member.role).toBe('athlete');
  });

  it('el rol owner no se puede pedir por PATCH: la titularidad no se transfiere así', async () => {
    const ctx = await createOrgCtx('own-transfer@test.com', 'Transfer Gym');
    const member = await preload(ctx, 'Aspirante');
    const res = await req('PATCH', `members/${member.id}`, ctx.owner.token, ctx.orgId, {
      role: 'owner',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('profile parcial no pisa el resto', async () => {
    const ctx = await createOrgCtx('own-i@test.com', 'Partial Gym');
    const member = await preload(ctx, 'Caro', {});
    const res = await req('PATCH', `members/${member.id}`, ctx.owner.token, ctx.orgId, {
      profile: { phone: '291-5555' },
    });
    const dto = ((await res.json()) as {
      member: { profile: { displayName?: string; phone?: string } };
    }).member;
    expect(dto.profile.displayName).toBe('Caro');
    expect(dto.profile.phone).toBe('291-5555');
  });
});

describe('GET /members: paginación y búsqueda', () => {
  it('25 invitados con limit=10 → 3 páginas estables sin duplicados ni faltantes', async () => {
    const ctx = await createOrgCtx('own-j@test.com', 'Pag Gym');
    for (let i = 0; i < 25; i++) await preload(ctx, `Cliente ${String(i).padStart(2, '0')}`);

    const seen = new Set<string>();
    let after: string | null = null;
    let pages = 0;
    do {
      const path = `members?status=invited&limit=10${after ? `&after=${after}` : ''}`;
      const res = await req('GET', path, ctx.owner.token, ctx.orgId);
      expect(res.status).toBe(200);
      const page = (await res.json()) as { items: { id: string }[]; nextCursor: string | null };
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      after = page.nextCursor;
      pages += 1;
    } while (after !== null);
    expect(pages).toBe(3);
    expect(seen.size).toBe(25);
  });

  it('q=mar matchea María y Marcos (prefijo case-insensitive), y nombres de user vinculado', async () => {
    const ctx = await createOrgCtx('own-k@test.com', 'Search Gym');
    await preload(ctx, 'María López');
    await preload(ctx, 'Marcos');
    await preload(ctx, 'Pedro');

    const res = await req('GET', 'members?q=mar', ctx.owner.token, ctx.orgId);
    const { items } = (await res.json()) as { items: { profile: { displayName?: string } }[] };
    expect(items.map((m) => m.profile.displayName).sort()).toEqual(['Marcos', 'María López']);

    // búsqueda por nombre del user vinculado ($lookup)
    const martina = await seedUser('martina@test.com', 'Martina');
    expect((await req('POST', 'orgs/join', martina.token, undefined, { code: ctx.joinCode })).status).toBe(201);
    const res2 = await req('GET', 'members?q=mart', ctx.owner.token, ctx.orgId);
    const linked = (await res2.json()) as { items: { user?: { name: string } }[] };
    expect(linked.items.some((m) => m.user?.name === 'Martina')).toBe(true);
  });
});
