import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { memberships, users } from '../../db/collections.js';
import { startTestDb, stopTestDb } from '../../test/mongo.js';
import { testConfig } from '../../test/helpers.js';
import { issueAccessToken } from '../auth/token-service.js';
import { slugify } from './orgs.service.js';

const config = testConfig();
const app = createApp(config);

const DUMMY_HASH = 'scrypt$32768$8$1$x$x'; // nunca se verifica en esta suite

/** Inserta user directo (el flujo register/verify ya está cubierto en auth). */
async function seedUser(email: string, verified = true): Promise<{ id: ObjectId; token: string }> {
  const now = new Date();
  const id = new ObjectId();
  await users().insertOne({
    _id: id,
    email,
    emailVerifiedAt: verified ? now : null,
    name: 'Ana',
    passwordHash: DUMMY_HASH,
    createdAt: now,
    updatedAt: now,
  });
  return { id, token: await issueAccessToken(id.toHexString(), config) };
}

function req(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(`/api/v1/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const TZ = 'America/Argentina/Buenos_Aires';

async function createOrgAs(token: string, name: string) {
  const res = await req('POST', 'orgs', token, { name, timezone: TZ });
  expect(res.status).toBe(201);
  const { org } = (await res.json()) as {
    org: { id: string; slug: string; joinCode: string };
  };
  return org;
}

beforeAll(startTestDb, 120_000); // primera corrida descarga el binario de mongod
afterAll(stopTestDb);

describe('slugify', () => {
  it('normaliza acentos y símbolos', () => {
    expect(slugify('Bahía Cross')).toBe('bahia-cross');
    expect(slugify('  ¡Ñandú! Box 3 ')).toBe('nandu-box-3');
    expect(slugify('***')).toBe('org');
  });
});

describe('POST /orgs', () => {
  it('feliz: org + membership owner activa; joinCode visible para el creador', async () => {
    const owner = await seedUser('owner1@test.com');
    const org = await createOrgAs(owner.token, 'Box Central');
    expect(org.slug).toBe('box-central');
    expect(org.joinCode).toMatch(/^box-central-[a-z0-9]{4}$/);
    const m = await memberships().findOne({ orgId: new ObjectId(org.id), userId: owner.id });
    expect(m?.role).toBe('owner');
    expect(m?.status).toBe('active');
  });

  it('sin email verificado → 403 EMAIL_NOT_VERIFIED', async () => {
    const unverified = await seedUser('nover@test.com', false);
    const res = await req('POST', 'orgs', unverified.token, { name: 'Gym X', timezone: TZ });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('timezone inexistente → 400', async () => {
    const owner = await seedUser('owner2@test.com');
    const res = await req('POST', 'orgs', owner.token, {
      name: 'Gym Y',
      timezone: 'America/Springfield',
    });
    expect(res.status).toBe(400);
  });

  it('mismo nombre dos veces → slugs x y x-2', async () => {
    const owner = await seedUser('owner3@test.com');
    const first = await createOrgAs(owner.token, 'Duplicado');
    const second = await createOrgAs(owner.token, 'Duplicado');
    expect(first.slug).toBe('duplicado');
    expect(second.slug).toBe('duplicado-2');
    expect(second.joinCode).toMatch(/^duplicado-2-[a-z0-9]{4}$/);
  });
});

describe('GET/PATCH /orgs/current + regenerate-code', () => {
  it('athlete no ve joinCode; owner sí; admin no puede PATCH ni regenerar', async () => {
    const owner = await seedUser('owner4@test.com');
    const org = await createOrgAs(owner.token, 'Visibilidad');
    const orgHeader = { 'x-org-id': org.id };

    // athlete entra por join
    const athlete = await seedUser('ath4@test.com');
    const join = await req('POST', 'orgs/join', athlete.token, { code: org.joinCode });
    expect(join.status).toBe(201);

    const asOwner = await req('GET', 'orgs/current', owner.token, undefined, orgHeader);
    expect(((await asOwner.json()) as { org: { joinCode?: string } }).org.joinCode).toBeDefined();
    const asAthlete = await req('GET', 'orgs/current', athlete.token, undefined, orgHeader);
    expect(asAthlete.status).toBe(200);
    expect(
      ((await asAthlete.json()) as { org: { joinCode?: string } }).org.joinCode,
    ).toBeUndefined();

    // admin sembrado directo: PATCH y regenerate → 403 FORBIDDEN_ROLE
    const admin = await seedUser('adm4@test.com');
    const now = new Date();
    await memberships().insertOne({
      _id: new ObjectId(),
      orgId: new ObjectId(org.id),
      userId: admin.id,
      role: 'admin',
      status: 'active',
      profile: {},
      createdAt: now,
      updatedAt: now,
    });
    const patch = await req('PATCH', 'orgs/current', admin.token, { name: 'Otro' }, orgHeader);
    expect(patch.status).toBe(403);
    const regen = await req('POST', 'orgs/current/regenerate-code', admin.token, undefined, orgHeader);
    expect(regen.status).toBe(403);
  });

  it('owner: settings fuera de rango → 400; timezone válida se refleja en GET', async () => {
    const owner = await seedUser('owner5@test.com');
    const org = await createOrgAs(owner.token, 'Ajustes');
    const orgHeader = { 'x-org-id': org.id };

    const bad = await req(
      'PATCH',
      'orgs/current',
      owner.token,
      { settings: { cancellationWindowHours: 100 } },
      orgHeader,
    );
    expect(bad.status).toBe(400);

    const ok = await req(
      'PATCH',
      'orgs/current',
      owner.token,
      { timezone: 'America/Santiago', settings: { cancellationWindowHours: 6 } },
      orgHeader,
    );
    expect(ok.status).toBe(200);
    const after = await req('GET', 'orgs/current', owner.token, undefined, orgHeader);
    const dto = ((await after.json()) as {
      org: { timezone: string; settings: { cancellationWindowHours: number; sessionGenerationDays: number } };
    }).org;
    expect(dto.timezone).toBe('America/Santiago');
    expect(dto.settings.cancellationWindowHours).toBe(6);
    expect(dto.settings.sessionGenerationDays).toBe(14); // parcial no pisa el resto
  });

  it('regenerate: el código viejo muere, el nuevo sirve, los miembros siguen (RN-01)', async () => {
    const owner = await seedUser('owner6@test.com');
    const org = await createOrgAs(owner.token, 'Rotativo');
    const orgHeader = { 'x-org-id': org.id };

    const athlete = await seedUser('ath6@test.com');
    expect((await req('POST', 'orgs/join', athlete.token, { code: org.joinCode })).status).toBe(201);

    const regen = await req('POST', 'orgs/current/regenerate-code', owner.token, undefined, orgHeader);
    expect(regen.status).toBe(200);
    const { joinCode: fresh } = (await regen.json()) as { joinCode: string };
    expect(fresh).not.toBe(org.joinCode);

    const oldCode = await req('POST', 'orgs/join', (await seedUser('ath6b@test.com')).token, {
      code: org.joinCode,
    });
    expect(oldCode.status).toBe(404);
    expect((await req('POST', 'orgs/join', (await seedUser('ath6c@test.com')).token, { code: fresh })).status).toBe(201);

    // miembro previo intacto
    expect((await req('GET', 'orgs/current', athlete.token, undefined, orgHeader)).status).toBe(200);
  });
});

describe('POST /orgs/join', () => {
  it('case-insensitive, inexistente 404, doble join 409, disabled no reactiva', async () => {
    const owner = await seedUser('owner7@test.com');
    const org = await createOrgAs(owner.token, 'Joins');

    const a = await seedUser('ath7@test.com');
    expect(
      (await req('POST', 'orgs/join', a.token, { code: org.joinCode.toUpperCase() })).status,
    ).toBe(201);
    expect((await req('POST', 'orgs/join', a.token, { code: org.joinCode })).status).toBe(409);

    const ghost = await req('POST', 'orgs/join', a.token, { code: 'no-existe-xxxx' });
    expect(ghost.status).toBe(404);
    expect(((await ghost.json()) as { error: { code: string } }).error.code).toBe('ORG_CODE_INVALID');

    // disabled: no auto-reactivación (RN-03)
    await memberships().updateOne(
      { orgId: new ObjectId(org.id), userId: a.id },
      { $set: { status: 'disabled' } },
    );
    expect((await req('POST', 'orgs/join', a.token, { code: org.joinCode })).status).toBe(409);
  });

  it('vinculación de invitado: misma ficha, adminNotes conservadas, status active', async () => {
    const owner = await seedUser('owner8@test.com');
    const org = await createOrgAs(owner.token, 'Vinculos');
    const invited = await seedUser('invitada@test.com');

    const now = new Date();
    const preloadId = new ObjectId();
    await memberships().insertOne({
      _id: preloadId,
      orgId: new ObjectId(org.id),
      userId: null,
      role: 'athlete',
      status: 'invited',
      profile: { displayName: 'Caro' },
      adminNotes: 'lesión de hombro',
      invitedEmail: 'invitada@test.com',
      createdAt: now,
      updatedAt: now,
    });

    const res = await req('POST', 'orgs/join', invited.token, { code: org.joinCode });
    expect(res.status).toBe(201);
    const { membership } = (await res.json()) as { membership: { id: string; status: string } };
    expect(membership.id).toBe(preloadId.toHexString()); // id estable: no ficha duplicada
    expect(membership.status).toBe('active');

    const doc = await memberships().findOne({ _id: preloadId });
    expect(doc?.userId?.equals(invited.id)).toBe(true);
    expect(doc?.adminNotes).toBe('lesión de hombro');
    expect(doc?.profile.displayName).toBe('Caro');
    expect(doc?.joinedAt).toBeInstanceOf(Date);
  });

  it('carrera de doble join → exactamente una membership', async () => {
    const owner = await seedUser('owner9@test.com');
    const org = await createOrgAs(owner.token, 'Carrera');
    const racer = await seedUser('racer@test.com');

    const [r1, r2] = await Promise.all([
      req('POST', 'orgs/join', racer.token, { code: org.joinCode }),
      req('POST', 'orgs/join', racer.token, { code: org.joinCode }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const count = await memberships().countDocuments({
      orgId: new ObjectId(org.id),
      userId: racer.id,
    });
    expect(count).toBe(1);
  });
});

describe('GET /me + /me/memberships', () => {
  it('devuelve el user propio y solo membresías active/invited con orgName/orgSlug', async () => {
    const user = await seedUser('yo@test.com');
    const me = await req('GET', 'me', user.token);
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe('yo@test.com');

    const owner = await seedUser('owner10@test.com');
    const orgA = await createOrgAs(owner.token, 'Alfa Gym');
    const orgB = await createOrgAs(owner.token, 'Beta Gym');
    const orgC = await createOrgAs(owner.token, 'Gamma Gym');
    const now = new Date();
    await memberships().insertMany([
      { _id: new ObjectId(), orgId: new ObjectId(orgA.id), userId: user.id, role: 'athlete', status: 'active', profile: {}, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), orgId: new ObjectId(orgB.id), userId: user.id, role: 'athlete', status: 'invited', profile: {}, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), orgId: new ObjectId(orgC.id), userId: user.id, role: 'athlete', status: 'disabled', profile: {}, createdAt: now, updatedAt: now },
    ]);

    const res = await req('GET', 'me/memberships', user.token);
    const { memberships: list } = (await res.json()) as {
      memberships: { orgSlug: string; status: string }[];
    };
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.orgSlug).sort()).toEqual(['alfa-gym', 'beta-gym']);
  });
});
