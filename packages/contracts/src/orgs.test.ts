import { describe, expect, it } from 'vitest';
import { createOrgBody, joinOrgBody, orgDto, updateOrgBody } from './orgs.js';

const ID = 'a'.repeat(24);

describe('createOrgBody', () => {
  it('trimea name y valida largo 2..60', () => {
    expect(
      createOrgBody.parse({ name: '  Box Central  ', timezone: 'America/Argentina/Buenos_Aires' })
        .name,
    ).toBe('Box Central');
    expect(() => createOrgBody.parse({ name: 'X', timezone: 'UTC' })).toThrow();
    expect(() => createOrgBody.parse({ name: 'x'.repeat(61), timezone: 'UTC' })).toThrow();
    expect(() => createOrgBody.parse({ name: 'Box', timezone: 'UTC', slug: 'box' })).toThrow();
  });
});

describe('updateOrgBody', () => {
  it('settings parciales dentro de rango (RN-05/08)', () => {
    expect(
      updateOrgBody.parse({ settings: { cancellationWindowHours: 0 } }).settings
        ?.cancellationWindowHours,
    ).toBe(0);
    expect(() => updateOrgBody.parse({ settings: { cancellationWindowHours: 100 } })).toThrow();
    expect(() => updateOrgBody.parse({ settings: { sessionGenerationDays: 5 } })).toThrow();
    expect(() => updateOrgBody.parse({ settings: { otro: 1 } })).toThrow();
  });
});

describe('joinOrgBody', () => {
  it('normaliza code a lowercase/trim (RN-01 case-insensitive)', () => {
    expect(joinOrgBody.parse({ code: '  BAHIA-CROSS-X9K2 ' }).code).toBe('bahia-cross-x9k2');
    expect(() => joinOrgBody.parse({ code: 'ab' })).toThrow();
    expect(() => joinOrgBody.parse({ code: 'con espacios' })).toThrow();
  });
});

describe('orgDto', () => {
  const base = {
    id: ID,
    name: 'Box',
    slug: 'box',
    timezone: 'UTC',
    settings: { cancellationWindowHours: 2, sessionGenerationDays: 14 },
  };

  it('joinCode opcional (solo admin/owner); campos extra rechazados', () => {
    expect(orgDto.parse(base).joinCode).toBeUndefined();
    expect(orgDto.parse({ ...base, joinCode: 'box-a1b2' }).joinCode).toBe('box-a1b2');
    expect(() => orgDto.parse({ ...base, status: 'active' })).toThrow();
  });
});
