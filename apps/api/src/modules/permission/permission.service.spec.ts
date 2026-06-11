import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { FailClosedPermissionWrapper } from './fail-closed.wrapper';
import { PermissionService } from './permission.service';
import type {
  ActorSnapshot,
  ExplicitPermissionRow,
  MatterMemberSnapshot,
  MatterSnapshot,
} from './permission.service';
import type { WallMembershipReader } from './wall-membership.reader';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const matterId = '11111111-1111-4111-8111-111111111199';
const userId = '11111111-1111-4111-8111-111111111101';

class TestPermissionService extends PermissionService {
  actor: ActorSnapshot | null = { userId, role: 'matter_owner', status: 'active' };
  matter: MatterSnapshot | null = { matterId, tenantId, status: 'active' };
  member: MatterMemberSnapshot | null = { matterRole: 'owner', accessLevel: 'edit' };
  explicitRows: ExplicitPermissionRow[] = [];

  protected override async findActor(): Promise<ActorSnapshot | null> {
    return this.actor;
  }

  protected override async findMatter(): Promise<MatterSnapshot | null> {
    return this.matter;
  }

  protected override async findMatterMember(): Promise<MatterMemberSnapshot | null> {
    return this.member;
  }

  protected override async findExplicitPermissionRows(): Promise<ExplicitPermissionRow[]> {
    return this.explicitRows;
  }
}

function createService(wallState = { isExcluded: false, isInsider: false }) {
  const recordAccessDenied = vi.fn(async () => undefined);
  const wrapper = new FailClosedPermissionWrapper({ recordAccessDenied } as never);
  const wallReader = {
    async readUserMatterState() {
      return { hasActiveWall: false, wallIds: [], ...wallState };
    },
  } as unknown as WallMembershipReader;
  return {
    recordAccessDenied,
    service: new TestPermissionService(wrapper, wallReader),
  };
}

describe('PermissionService matter evaluator', () => {
  it('allows read for active members and denies non-members by default', async () => {
    const { service, recordAccessDenied } = createService();

    await expect(service.canReadMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'ALLOW',
    });

    service.member = null;
    await expect(service.canReadMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'PERMISSION_DENIED',
    });
    expect(recordAccessDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'PERMISSION_DENIED' }),
    );
  });

  it('treats ethical wall exclusion as a deny override', async () => {
    const { service } = createService({ isExcluded: true, isInsider: true });

    await expect(service.canReadMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'ETHICAL_WALL_BLOCKED',
      appliedRules: ['ethical_wall:excluded'],
    });
  });

  it('allows edit only for owner or edit-level members', async () => {
    const { service } = createService();

    await expect(service.canEditMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'ALLOW',
    });

    service.member = { matterRole: 'member', accessLevel: 'read' };
    await expect(service.canEditMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['matter.edit:membership_not_edit'],
    });

    service.member = { matterRole: 'limited_reviewer', accessLevel: 'read' };
    await expect(service.canEditMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
    });
  });

  it('denies upload when the matter state blocks mutations', async () => {
    const { service } = createService();
    await expect(service.canUploadToMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'ALLOW',
    });

    service.matter = { matterId, tenantId, status: 'closed' };
    await expect(service.canUploadToMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'MATTER_CLOSED',
    });
  });

  it('lets explicit denies override otherwise allowed matter access', async () => {
    const { service } = createService();
    service.explicitRows = [{ effect: 'DENY', condition_json: null }];

    await expect(service.canReadMatter({ tenantId, userId }, matterId)).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['permissions:explicit_deny'],
    });
  });
});
