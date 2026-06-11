import { describe, expect, it } from 'vitest';
import { canIssueSessionForRole, isUserRole, userRoles } from './roles';

describe('user roles', () => {
  it('defines the seven R1 roles from DEC-15', () => {
    expect(userRoles).toEqual([
      'firm_admin',
      'security_admin',
      'matter_owner',
      'matter_member',
      'limited_reviewer',
      'knowledge_manager',
      'external_user',
    ]);
  });

  it('keeps role parsing fail-closed for unknown values', () => {
    expect(isUserRole('matter_owner')).toBe(true);
    expect(isUserRole('Matter Owner')).toBe(false);
    expect(canIssueSessionForRole('external_user')).toBe(false);
    expect(canIssueSessionForRole('matter_owner')).toBe(true);
  });
});

