import { describe, expect, it } from 'vitest';
import {
  loginBody,
  loginResponseDto,
  membershipSummaryDto,
  registerBody,
  resendVerificationBody,
  userDto,
  verifyEmailBody,
} from './auth.js';

const ID = 'a'.repeat(24);

describe('registerBody', () => {
  it('normaliza email y trimea name', () => {
    const r = registerBody.parse({
      email: ' Foo@BAR.com ',
      password: 'una-password',
      name: '  Ana  ',
    });
    expect(r.email).toBe('foo@bar.com');
    expect(r.name).toBe('Ana');
  });

  it('rechaza campo extra (.strict()), name vacío y name >80', () => {
    expect(() =>
      registerBody.parse({ email: 'a@b.co', password: 'x', name: 'Ana', admin: true }),
    ).toThrow();
    expect(() => registerBody.parse({ email: 'a@b.co', password: 'x', name: '   ' })).toThrow();
    expect(() =>
      registerBody.parse({ email: 'a@b.co', password: 'x', name: 'a'.repeat(81) }),
    ).toThrow();
  });

  it('acepta password de 1 char (la fortaleza la decide el servicio: WEAK_PASSWORD)', () => {
    expect(registerBody.parse({ email: 'a@b.co', password: '1', name: 'Ana' }).password).toBe('1');
    expect(() =>
      registerBody.parse({ email: 'a@b.co', password: 'x'.repeat(129), name: 'Ana' }),
    ).toThrow();
  });
});

describe('verifyEmailBody / resendVerificationBody / loginBody', () => {
  it('valida forma y rechaza extras', () => {
    expect(verifyEmailBody.parse({ token: 'abc' }).token).toBe('abc');
    expect(() => verifyEmailBody.parse({ token: '' })).toThrow();
    expect(() => verifyEmailBody.parse({ token: 'abc', extra: 1 })).toThrow();
    expect(resendVerificationBody.parse({ email: 'A@B.co' }).email).toBe('a@b.co');
    expect(() => loginBody.parse({ email: 'a@b.co' })).toThrow();
    expect(loginBody.parse({ email: 'a@b.co', password: 'p' }).password).toBe('p');
  });
});

describe('userDto / membershipSummaryDto / loginResponseDto', () => {
  const user = { id: ID, email: 'a@b.co', name: 'Ana', emailVerified: true };
  const membership = { id: ID, orgId: ID, orgName: 'Box', role: 'athlete', status: 'active' };

  it('acepta formas válidas', () => {
    expect(userDto.parse(user)).toEqual(user);
    expect(membershipSummaryDto.parse(membership)).toEqual(membership);
    expect(
      loginResponseDto.parse({ accessToken: 'jwt', user, memberships: [membership] }).memberships,
    ).toHaveLength(1);
  });

  it('rechaza campos internos filtrados (passwordHash) y roles inválidos', () => {
    expect(() => userDto.parse({ ...user, passwordHash: 'x' })).toThrow();
    expect(() => membershipSummaryDto.parse({ ...membership, role: 'superadmin' })).toThrow();
  });
});
