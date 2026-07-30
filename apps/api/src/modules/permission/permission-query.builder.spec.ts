import { describe, expect, it } from 'vitest';
import { PermissionQueryBuilder } from './permission-query.builder';

describe('PermissionQueryBuilder', () => {
  it('requires membership and applies permission and wall deny overrides before rows return', () => {
    const userId = '11111111-1111-4111-8111-111111111101';
    const filter = new PermissionQueryBuilder().buildMatterFilter(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        userId,
        role: 'matter_owner',
      },
      2,
      'matters',
    );

    expect(filter.sql).not.toContain("access_scope = 'firm_open'");
    expect(filter.sql).toContain('FROM matter_members');
    expect(filter.sql).toContain('NOT EXISTS');
    expect(filter.sql).toContain('ethical_wall_memberships');
    expect(filter.sql).toContain('FROM group_members gm');
    expect(filter.sql).toContain('$2::uuid');
    expect(filter.sql).toContain('$3::uuid');
    expect(filter.sql).toContain('FROM permissions p');
    expect(filter.sql).toContain("p.resource_type = 'matter'");
    expect(filter.sql).toContain("p.action = 'read'");
    expect(filter.sql).toContain("p.effect = 'DENY'");
    expect(filter.sql).toContain("p.condition_json <> '{}'::jsonb");
    expect(filter.sql).toContain("p.subject_type = 'role'");
    expect(filter.sql).toContain('p.subject_id = $4');
    expect(filter.sql).not.toContain('break_glass_requests');
    expect(filter.sql).not.toContain('break_glass_approvals');
    expect(filter.sql).toContain("any_insider.membership_type = 'insider'");
    expect(filter.sql).toContain("insider.membership_type = 'insider'");
    expect(filter.params).toEqual([userId, userId, 'matter_owner']);
    expect(filter.appliedRules).toEqual(
      expect.arrayContaining([
        'matter_members:required_for_read',
        'matter.permissions:condition_fail_closed',
        'matter.permissions:explicit_deny',
        'ethical_wall:excluded_filter',
        'ethical_wall:insider_required_filter',
        'ethical_wall:break_glass_requires_audited_read',
      ]),
    );
  });

  it('returns an always-false filter for roles with no matter read action', () => {
    const filter = new PermissionQueryBuilder().buildMatterFilter(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111101',
        role: 'external_user',
      },
      2,
    );

    expect(filter.sql).toBe('FALSE');
    expect(filter.params).toEqual([]);
  });
});
