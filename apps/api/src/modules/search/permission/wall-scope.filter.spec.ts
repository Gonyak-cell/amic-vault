import { describe, expect, it } from 'vitest';
import { WallScopeFilter } from './wall-scope.filter';
import type { SearchPermissionActor } from './search-scope.types';

const actor: SearchPermissionActor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  role: 'matter_owner',
};

describe('WallScopeFilter', () => {
  it('injects excluded, group, and insider-mode wall filters', () => {
    const filter = new WallScopeFilter().build(actor);

    expect(filter.sql).toContain('FROM ethical_walls ew');
    expect(filter.sql).toContain('FROM ethical_wall_memberships excluded');
    expect(filter.sql).toContain('FROM ethical_wall_memberships any_insider');
    expect(filter.sql).toContain('FROM ethical_wall_memberships insider');
    expect(filter.sql).toContain('FROM break_glass_requests excluded_override');
    expect(filter.sql).toContain('FROM break_glass_requests insider_override');
    expect(filter.sql).toContain("excluded.membership_type = 'excluded'");
    expect(filter.sql).toContain("insider.membership_type = 'insider'");
    expect(filter.sql).toContain("excluded_override.status = 'approved'");
    expect(filter.sql).toContain('excluded_override.expires_at > now()');
    expect(filter.sql).toContain('FROM break_glass_approvals excluded_approval');
    expect(filter.sql).toContain('FROM break_glass_approvals insider_approval');
    expect(filter.sql).toContain('FROM group_members gm');
    expect(filter.sql).toContain('gm.user_id = ?::uuid');
    expect(filter.params).toEqual([
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
    ]);
    expect(filter.appliedRules).toEqual([
      'ethical_wall:excluded_filter',
      'ethical_wall:insider_required_filter',
    ]);
  });
});
