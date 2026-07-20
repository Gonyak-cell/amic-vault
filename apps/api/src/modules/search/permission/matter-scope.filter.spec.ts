import { describe, expect, it } from 'vitest';
import { MatterScopeFilter } from './matter-scope.filter';
import type { SearchPermissionActor } from './search-scope.types';

const actor: SearchPermissionActor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  role: 'matter_owner',
  materializedScope: {
    allowedMatterIds: [
      '11111111-1111-4111-8111-111111111201',
      '11111111-1111-4111-8111-111111111202',
    ],
    deniedMatterIds: ['11111111-1111-4111-8111-111111111203'],
    wallBlockedMatterIds: [],
    allowedDocumentIds: [],
    deniedDocumentIds: [],
  },
};

describe('MatterScopeFilter', () => {
  it('injects tenant, required membership, unsupported condition, and explicit deny filters', () => {
    const filter = new MatterScopeFilter().build(actor);

    expect(filter.sql).toContain('idx.tenant_id = ?');
    expect(filter.sql).toContain('idx.matter_id = ANY(?::uuid[])');
    expect(filter.sql).toContain('NOT (idx.matter_id = ANY(?::uuid[]))');
    expect(filter.params).toEqual([
      actor.tenantId,
      actor.materializedScope?.allowedMatterIds,
      actor.materializedScope?.deniedMatterIds,
    ]);
    expect(filter.appliedRules).toContain('matter_members:materialized_required_for_read');
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
