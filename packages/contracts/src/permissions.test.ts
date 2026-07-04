import { describe, expect, it } from 'vitest';
import { role } from './enums.js';
import { PERMISSIONS, can, type PermissionAction } from './permissions.js';

describe('permissions matrix (RN-04)', () => {
  const actions = Object.keys(PERMISSIONS) as PermissionAction[];

  it('owner can do everything', () => {
    for (const action of actions) {
      expect(can('owner', action), action).toBe(true);
    }
  });

  it('athlete can do nothing administrative', () => {
    for (const action of actions) {
      expect(can('athlete', action), action).toBe(false);
    }
  });

  it('admin manages operations but not org-level settings', () => {
    expect(can('admin', 'members:manage')).toBe(true);
    expect(can('admin', 'schedule:manage')).toBe(true);
    expect(can('admin', 'packs:manage')).toBe(true);
    expect(can('admin', 'org:settings')).toBe(false);
    expect(can('admin', 'org:regenerate-code')).toBe(false);
    expect(can('admin', 'org:manage-admins')).toBe(false);
  });

  it('matrix only references valid roles', () => {
    for (const [action, roles] of Object.entries(PERMISSIONS)) {
      for (const r of roles) {
        expect(role.options, `${action} -> ${r}`).toContain(r);
      }
    }
  });
});
