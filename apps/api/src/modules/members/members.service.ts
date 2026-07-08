import type {
  CreateMemberBody,
  MemberDto,
  MembersQuery,
  Page,
  UpdateMemberBody,
} from '@bv/contracts';
import { ObjectId } from 'mongodb';
import type { AppVariables } from '../../app.js';
import { DomainError } from '../../lib/errors.js';
import {
  findMemberById,
  findMembershipByEmail,
  insertMember,
  listMembers,
  updateMember,
  type MemberRow,
} from './members.repo.js';

type OrgContext = AppVariables['org'];

/** memberDto es SOLO CRM: el único DTO del sistema que expone adminNotes. */
function toMemberDto(row: MemberRow): MemberDto {
  return {
    id: row._id.toHexString(),
    role: row.role,
    status: row.status,
    profile: row.profile,
    ...(row.adminNotes !== undefined ? { adminNotes: row.adminNotes } : {}),
    ...(row.invitedEmail !== undefined ? { invitedEmail: row.invitedEmail } : {}),
    ...(row.user
      ? {
          user: {
            id: row.user._id.toHexString(),
            name: row.user.name,
            email: row.user.email,
          },
        }
      : {}),
    ...(row.joinedAt ? { joinedAt: row.joinedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

const notFound = () => new DomainError('NOT_FOUND', 'Cliente inexistente.');

export async function list(org: OrgContext, query: MembersQuery): Promise<Page<MemberDto>> {
  const rows = await listMembers(new ObjectId(org.orgId), query);
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toMemberDto);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Pre-carga (RN-02): ficha 'invited' sin userId; se vincula en el join (F1-07). */
export async function create(org: OrgContext, body: CreateMemberBody): Promise<MemberDto> {
  const orgId = new ObjectId(org.orgId);
  if (body.invitedEmail) {
    const taken = await findMembershipByEmail(orgId, body.invitedEmail);
    if (taken) throw new DomainError('ALREADY_MEMBER', 'Ese email ya es parte de la organización.');
  }
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    orgId,
    userId: null,
    role: 'athlete' as const,
    status: 'invited' as const,
    profile: body.profile,
    ...(body.adminNotes !== undefined ? { adminNotes: body.adminNotes } : {}),
    ...(body.invitedEmail !== undefined ? { invitedEmail: body.invitedEmail } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await insertMember(doc);
  return toMemberDto(doc);
}

export async function get(org: OrgContext, memberId: string): Promise<MemberDto> {
  const row = await findMemberById(new ObjectId(org.orgId), new ObjectId(memberId));
  if (!row) throw notFound(); // cross-org incluido: 404, no 403 (sin oráculo)
  return toMemberDto(row);
}

export async function update(
  org: OrgContext,
  memberId: string,
  body: UpdateMemberBody,
): Promise<MemberDto> {
  const orgId = new ObjectId(org.orgId);
  const id = new ObjectId(memberId);
  const current = await findMemberById(orgId, id);
  if (!current) throw notFound();
  if (current.role === 'owner' && body.status !== undefined) {
    throw new DomainError('CANNOT_MODIFY_OWNER', 'La cuenta owner no se puede deshabilitar.');
  }
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.profile ?? {})) {
    set[`profile.${key}`] = value; // parcial: no pisa el resto del profile
  }
  if (body.adminNotes !== undefined) set.adminNotes = body.adminNotes;
  if (body.status !== undefined) set.status = body.status;
  if (Object.keys(set).length > 0) await updateMember(orgId, id, set);
  return get(org, memberId);
}
