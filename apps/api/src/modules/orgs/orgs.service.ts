import type {
  CreateOrgBody,
  JoinOrgBody,
  MembershipSummaryDto,
  OrgDto,
  UpdateOrgBody,
} from '@bv/contracts';
import { randomInt } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import type { MembershipDoc, OrganizationDoc, UserDoc } from '../../db/types.js';
import { DomainError } from '../../lib/errors.js';
import {
  findInvitedByEmail,
  findMembership,
  findOrgByJoinCode,
  findOrgById,
  findUserById,
  insertMembership,
  insertOrg,
  linkInvitedMembership,
  listSlugsLike,
  setJoinCode,
  updateOrgFields,
} from './orgs.repo.js';

type OrgContext = AppVariables['org'];

const DEFAULT_SETTINGS = { cancellationWindowHours: 2, sessionGenerationDays: 14 }; // RN-05/08
const JOINCODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const INSERT_RETRIES = 5;

// Solo estos roles ven el joinCode (RN-01: el código lo administra el gym).
const SEES_JOIN_CODE: readonly OrgContext['role'][] = ['owner', 'admin'];

let ianaTimezones: Set<string> | null = null;

/**
 * supportedValuesOf devuelve canónicos CLDR y excluye alias como
 * 'America/Argentina/Buenos_Aires' (canónico IANA, link en CLDR) — el
 * constructor de DateTimeFormat sí acepta todo el tzdb y lanza si no existe.
 */
function isValidTimezone(tz: string): boolean {
  ianaTimezones ??= new Set(Intl.supportedValuesOf('timeZone'));
  if (ianaTimezones.has(tz)) return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `Bahía Cross` → `bahia-cross` (sin acentos, [a-z0-9-]). */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'org';
}

function generateJoinCode(slug: string): string {
  const prefix = slug.slice(0, 24).replace(/-+$/, '');
  const suffix = Array.from({ length: 4 }, () =>
    JOINCODE_ALPHABET.charAt(randomInt(JOINCODE_ALPHABET.length)),
  ).join('');
  return `${prefix}-${suffix}`;
}

function isDuplicateKey(err: unknown): err is MongoServerError {
  return err instanceof MongoServerError && err.code === 11000;
}

function toOrgDto(org: OrganizationDoc, role: OrgContext['role']): OrgDto {
  return {
    id: org._id.toHexString(),
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    settings: org.settings,
    ...(SEES_JOIN_CODE.includes(role) ? { joinCode: org.joinCode } : {}),
  };
}

function toMembershipSummary(m: MembershipDoc, org: OrganizationDoc): MembershipSummaryDto {
  return {
    id: m._id.toHexString(),
    orgId: org._id.toHexString(),
    orgName: org.name,
    orgSlug: org.slug,
    role: m.role,
    status: m.status,
  };
}

/** Guard de email verificado para crear/joinear orgs (spec F1-07). */
async function requireVerifiedUser(userId: string): Promise<UserDoc> {
  const user = await findUserById(new ObjectId(userId));
  if (!user) throw new DomainError('TOKEN_INVALID', 'Autenticación inválida.');
  if (user.emailVerifiedAt === null) {
    throw new DomainError('EMAIL_NOT_VERIFIED', 'Verificá tu email antes de continuar.');
  }
  return user;
}

export async function createOrg(userId: string, body: CreateOrgBody): Promise<OrgDto> {
  const user = await requireVerifiedUser(userId);
  if (!isValidTimezone(body.timezone)) {
    throw new DomainError('VALIDATION_ERROR', 'Timezone IANA inválida.');
  }

  const base = slugify(body.name);
  const taken = new Set(await listSlugsLike(base));
  let suffix = 1;
  const nextSlug = (): string => {
    let candidate = suffix === 1 ? base : `${base}-${String(suffix)}`;
    while (taken.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${String(suffix)}`;
    }
    taken.add(candidate);
    return candidate;
  };

  const now = new Date();
  let slug = nextSlug();
  for (let attempt = 0; ; attempt++) {
    const org: OrganizationDoc = {
      _id: new ObjectId(),
      name: body.name,
      slug,
      joinCode: generateJoinCode(slug),
      timezone: body.timezone,
      settings: { ...DEFAULT_SETTINGS },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    try {
      await insertOrg(org);
      await insertMembership({
        _id: new ObjectId(),
        orgId: org._id,
        userId: user._id,
        role: 'owner',
        status: 'active',
        profile: {},
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return toOrgDto(org, 'owner');
    } catch (err) {
      // Carreras contra los índices únicos: slug → probar siguiente sufijo;
      // joinCode → basta reintentar (se regenera solo).
      if (!isDuplicateKey(err) || attempt >= INSERT_RETRIES) throw err;
      const keyPattern: Record<string, unknown> = (err.keyPattern ?? {}) as Record<string, unknown>;
      if (Object.keys(keyPattern).includes('slug')) slug = nextSlug();
    }
  }
}

export async function getCurrentOrg(org: OrgContext): Promise<OrgDto> {
  const doc = await findOrgById(new ObjectId(org.orgId));
  if (!doc) throw new DomainError('NOT_FOUND', 'La organización no existe.');
  return toOrgDto(doc, org.role);
}

export async function updateOrg(org: OrgContext, body: UpdateOrgBody): Promise<OrgDto> {
  if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
    throw new DomainError('VALIDATION_ERROR', 'Timezone IANA inválida.');
  }
  const set: Record<string, unknown> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.timezone !== undefined) set.timezone = body.timezone;
  for (const [key, value] of Object.entries(body.settings ?? {})) {
    set[`settings.${key}`] = value; // parcial: dot-path no pisa el resto
  }
  if (Object.keys(set).length > 0) await updateOrgFields(new ObjectId(org.orgId), set);
  return getCurrentOrg(org);
}

/** RN-01: el código anterior muere al instante; miembros existentes intactos. */
export async function regenerateJoinCode(org: OrgContext): Promise<{ joinCode: string }> {
  const doc = await findOrgById(new ObjectId(org.orgId));
  if (!doc) throw new DomainError('NOT_FOUND', 'La organización no existe.');
  for (let attempt = 0; ; attempt++) {
    const joinCode = generateJoinCode(doc.slug);
    try {
      await setJoinCode(doc._id, joinCode);
      return { joinCode };
    } catch (err) {
      if (!isDuplicateKey(err) || attempt >= INSERT_RETRIES) throw err;
    }
  }
}

export async function joinOrg(userId: string, body: JoinOrgBody): Promise<MembershipSummaryDto> {
  const user = await requireVerifiedUser(userId);
  const org = await findOrgByJoinCode(body.code);
  if (!org) throw new DomainError('ORG_CODE_INVALID', 'El código no corresponde a ningún gimnasio.');

  // Cualquier membresía previa bloquea, incluida disabled: no hay auto-reactivación (RN-03).
  const existing = await findMembership(org._id, user._id);
  if (existing) throw new DomainError('ALREADY_MEMBER', 'Ya sos parte de esta organización.');

  // Vinculación de pre-carga (Funcional F2): conserva profile/adminNotes.
  const invited = await findInvitedByEmail(org._id, user.email);
  if (invited) {
    const linked = await linkInvitedMembership(invited._id, user._id);
    if (linked) return toMembershipSummary(linked, org);
  }

  const now = new Date();
  const membership: MembershipDoc = {
    _id: new ObjectId(),
    orgId: org._id,
    userId: user._id,
    role: 'athlete',
    status: 'active',
    profile: {},
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await insertMembership(membership);
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new DomainError('ALREADY_MEMBER', 'Ya sos parte de esta organización.');
    }
    throw err;
  }
  return toMembershipSummary(membership, org);
}
