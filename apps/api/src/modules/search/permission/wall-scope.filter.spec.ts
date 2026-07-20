import { describe, expect, it } from 'vitest';
import { WallScopeFilter } from './wall-scope.filter';
import type { SearchPermissionActor } from './search-scope.types';

const actor: SearchPermissionActor = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111101',
  role: 'matter_owner',
  materializedScope: {
    allowedMatterIds: [],
    deniedMatterIds: [],
    wallBlockedMatterIds: [
      '11111111-1111-4111-8111-111111111201',
      '11111111-1111-4111-8111-111111111202',
    ],
    allowedDocumentIds: [],
    deniedDocumentIds: [],
  },
};

describe('WallScopeFilter', () => {
  it('injects excluded, group, and insider-mode wall filters', () => {
    const filter = new WallScopeFilter().build(actor);

    expect(filter.sql).toContain('NOT (idx.matter_id = ANY(?::uuid[]))');
    expect(filter.params).toEqual([actor.materializedScope?.wallBlockedMatterIds]);
    expect(filter.appliedRules).toEqual([
      'ethical_wall:excluded_filter',
      'ethical_wall:insider_required_filter',
    ]);
  });
});
