import { describe, expect, it } from 'vitest';
import { MatterEntity } from './matter.entity';
import {
  canCreateMatterRole,
  canReadMatterConservatively,
  shouldRestrictMatterListToLead,
} from './matter.service';

function matter(leadLawyerId: string | null): MatterEntity {
  return new MatterEntity({
    matterId: '11111111-1111-4111-8111-1111111111aa',
    tenantId: '11111111-1111-4111-8111-111111111111',
    clientId: '11111111-1111-4111-8111-1111111111bb',
    matterCode: 'M-001',
    matterName: 'Matter',
    matterType: 'contract',
    status: 'proposed',
    openedAt: null,
    closedAt: null,
    leadLawyerId,
    practiceGroup: null,
    metadata: {},
    createdBy: '11111111-1111-4111-8111-111111111101',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('matter conservative guards', () => {
  it('allows only firm admin and matter owner to create matters', () => {
    expect(canCreateMatterRole('firm_admin')).toBe(true);
    expect(canCreateMatterRole('matter_owner')).toBe(true);
    expect(canCreateMatterRole('matter_member')).toBe(false);
  });

  it('keeps read access conservative until PermissionService replaces it', () => {
    expect(canReadMatterConservatively('firm_admin', 'user-a', matter(null))).toBe(true);
    expect(canReadMatterConservatively('matter_owner', 'user-a', matter('user-a'))).toBe(true);
    expect(canReadMatterConservatively('matter_owner', 'user-a', matter('user-b'))).toBe(false);
  });

  it('injects the list visibility decision before querying', () => {
    expect(shouldRestrictMatterListToLead('firm_admin')).toBe(false);
    expect(shouldRestrictMatterListToLead('matter_owner')).toBe(true);
    expect(shouldRestrictMatterListToLead('matter_member')).toBe(true);
  });
});
