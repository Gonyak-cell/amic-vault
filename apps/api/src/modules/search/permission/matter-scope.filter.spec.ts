import { describe, expect, it } from 'vitest';
import { MatterScopeFilter } from './matter-scope.filter';
import type { SearchPermissionActor } from './search-scope.types';

const actor: SearchPermissionActor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  role: 'matter_owner',
};

describe('MatterScopeFilter', () => {
  it('injects tenant, membership, unsupported condition, and explicit deny filters', () => {
    const filter = new MatterScopeFilter().build(actor);

    expect(filter.sql).toContain('idx.tenant_id = ?');
    expect(filter.sql).toContain('FROM matter_members mm');
    expect(filter.sql).toContain('mm.user_id = ?::uuid');
    expect(filter.sql).toContain("p.resource_type = 'matter'");
    expect(filter.sql).toContain("p.action = 'read'");
    expect(filter.sql).toContain("p.effect = 'DENY'");
    expect(filter.sql).toContain("p.condition_json <> '{}'::jsonb");
    expect(filter.params).toEqual([
      actor.tenantId,
      actor.userId,
      actor.userId,
      actor.role,
      actor.userId,
      actor.userId,
      actor.role,
      actor.userId,
    ]);
    expect(filter.appliedRules).toContain('matter.membership:required');
  });

  it('fails closed for roles without matter read permission', () => {
    const filter = new MatterScopeFilter().build({ ...actor, role: 'external_user' });

    expect(filter).toEqual({
      sql: 'FALSE',
      params: [],
      appliedRules: ['matter.read:role_deny'],
    });
  });
});
