import { describe, expect, it } from 'vitest';
import { createMemberBody, memberDto, membersQuery, updateMemberBody } from './members.js';

const ID = 'a'.repeat(24);

describe('createMemberBody', () => {
  it('displayName requerido; invitedEmail se normaliza; extras rechazados', () => {
    const r = createMemberBody.parse({
      invitedEmail: ' Caro@Test.com ',
      profile: { displayName: '  Caro  ' },
      adminNotes: 'lesión de hombro',
    });
    expect(r.invitedEmail).toBe('caro@test.com');
    expect(r.profile.displayName).toBe('Caro');
    expect(() => createMemberBody.parse({ profile: {} })).toThrow();
    expect(() => createMemberBody.parse({ profile: { displayName: 'C' }, role: 'admin' })).toThrow();
    expect(() =>
      createMemberBody.parse({ profile: { displayName: 'C' }, adminNotes: 'x'.repeat(2001) }),
    ).toThrow();
  });

  it('birthdate valida fecha real', () => {
    expect(() =>
      createMemberBody.parse({ profile: { displayName: 'C', birthdate: '2026-02-30' } }),
    ).toThrow();
  });
});

describe('updateMemberBody', () => {
  it('status solo active|disabled (invited no se setea a mano); profile parcial', () => {
    expect(updateMemberBody.parse({ status: 'disabled' }).status).toBe('disabled');
    expect(() => updateMemberBody.parse({ status: 'invited' })).toThrow();
    expect(updateMemberBody.parse({ profile: { phone: '291-5555' } }).profile?.phone).toBe(
      '291-5555',
    );
  });
});

describe('membersQuery', () => {
  it('hereda cursor + filtros propios', () => {
    const q = membersQuery.parse({ status: 'invited', q: 'mar', limit: '10', after: ID });
    expect(q.limit).toBe(10);
    expect(q.status).toBe('invited');
    expect(() => membersQuery.parse({ q: '' })).toThrow();
  });
});

describe('memberDto', () => {
  it('acepta ficha completa; rechaza campos internos crudos', () => {
    const full = {
      id: ID,
      role: 'athlete',
      status: 'active',
      profile: { displayName: 'Caro' },
      adminNotes: 'nota',
      user: { id: ID, name: 'Caro', email: 'c@t.co' },
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(memberDto.parse(full).adminNotes).toBe('nota');
    expect(() => memberDto.parse({ ...full, userId: ID })).toThrow();
  });
});
