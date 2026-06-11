import { describe, expect, it } from 'vitest';
import { rolePermissionActions } from './permission-actions';
import {
  assertCompleteRolePermissionMatrix,
  isRoleAllowedForAction,
  rolePermissionDecision,
} from './role-permission-matrix';
import { userRoles } from './roles';

describe('role permission matrix', () => {
  it('covers every R1 action for every role', () => {
    expect(() => assertCompleteRolePermissionMatrix()).not.toThrow();
    expect(rolePermissionActions.length).toBeGreaterThan(0);
    expect(userRoles).toHaveLength(7);
  });

  it('keeps admin-only and wall-only actions narrow', () => {
    expect(isRoleAllowedForAction('firm_admin', 'user.role_assign')).toBe(true);
    expect(isRoleAllowedForAction('security_admin', 'user.role_assign')).toBe(false);
    expect(isRoleAllowedForAction('security_admin', 'wall.create')).toBe(true);
    expect(isRoleAllowedForAction('firm_admin', 'wall.create')).toBe(false);
  });

  it('keeps unknown matrix lookups fail-closed through explicit deny semantics', () => {
    expect(rolePermissionDecision('external_user', 'matter.read')).toBe('deny');
    expect(rolePermissionDecision('matter_member', 'matter.member_add')).toBe('deny');
  });
});

