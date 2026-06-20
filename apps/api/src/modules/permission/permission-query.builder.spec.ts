import { describe, expect, it } from 'vitest';
import { PermissionQueryBuilder } from './permission-query.builder';

describe('PermissionQueryBuilder', () => {
  it('injects matter membership and wall filters into SQL before rows are returned', () => {
    const filter = new PermissionQueryBuilder().buildMatterFilter(
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111101',
        role: 'matter_owner',
      },
      2,
      'matters',
    );

    expect(filter.sql).toContain('EXISTS');
    expect(filter.sql).toContain('FROM matter_members');
    expect(filter.sql).toContain('NOT EXISTS');
    expect(filter.sql).toContain('ethical_wall_memberships');
    expect(filter.sql).toContain('FROM group_members gm');
    expect(filter.sql).toContain('$2::uuid');
    expect(filter.sql).toContain('$3::uuid');
    expect(filter.params).toHaveLength(2);
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
