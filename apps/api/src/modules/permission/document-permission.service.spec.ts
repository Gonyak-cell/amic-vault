import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { FailClosedPermissionWrapper } from './fail-closed.wrapper';
import { DocumentPermissionService } from './document-permission.service';
import type {
  DocumentActorSnapshot,
  DocumentMatterMemberSnapshot,
  DocumentPermissionTarget,
  DocumentWallDecision,
  ExplicitDocumentPermissionRow,
} from './document-permission.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const documentId = '11111111-1111-4111-8111-111111111177';
const matterId = '11111111-1111-4111-8111-111111111199';
const userId = '11111111-1111-4111-8111-111111111101';

class TestDocumentPermissionService extends DocumentPermissionService {
  actor: DocumentActorSnapshot | null = { userId, role: 'matter_owner', status: 'active' };
  target: DocumentPermissionTarget | null = {
    documentId,
    tenantId,
    matterId,
    status: 'draft',
    matterStatus: 'active',
    confidentialityLevel: 'standard',
    privilegeStatus: 'none',
  };
  member: DocumentMatterMemberSnapshot | null = { matterRole: 'owner', accessLevel: 'edit' };
  wall: DocumentWallDecision = { blocked: false, appliedRules: [] };
  explicitRows: ExplicitDocumentPermissionRow[] = [];

  protected override async findActor(): Promise<DocumentActorSnapshot | null> {
    return this.actor;
  }

  protected override async findDocumentTarget(): Promise<DocumentPermissionTarget | null> {
    return this.target;
  }

  protected override async findMatterMember(): Promise<DocumentMatterMemberSnapshot | null> {
    return this.member;
  }

  protected override async evaluateWall(): Promise<DocumentWallDecision> {
    return this.wall;
  }

  protected override async findExplicitDocumentPermissionRows(): Promise<
    ExplicitDocumentPermissionRow[]
  > {
    return this.explicitRows;
  }
}

function createService() {
  const recordAccessDenied = vi.fn(async () => undefined);
  const wrapper = new FailClosedPermissionWrapper({ recordAccessDenied } as never);
  return {
    recordAccessDenied,
    service: new TestDocumentPermissionService(wrapper),
  };
}

describe('DocumentPermissionService', () => {
  it('allows standard reads for matter members and denies non-members', async () => {
    const { service, recordAccessDenied } = createService();
    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'ALLOW',
    });

    service.member = null;
    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'PERMISSION_DENIED',
    });
    expect(recordAccessDenied).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'document', reasonCode: 'PERMISSION_DENIED' }),
    );
  });

  it('requires explicit allow for high confidentiality documents', async () => {
    const { service } = createService();
    service.target = { ...service.target!, confidentialityLevel: 'high' };

    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['document.confidentiality:high:explicit_allow_required'],
    });

    service.explicitRows = [{ effect: 'ALLOW', condition_json: null }];
    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'ALLOW',
      appliedRules: expect.arrayContaining(['permissions:explicit_allow']),
    });
  });

  it('lets explicit deny override explicit allow', async () => {
    const { service } = createService();
    service.explicitRows = [
      { effect: 'ALLOW', condition_json: null },
      { effect: 'DENY', condition_json: null },
    ];
    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: ['permissions:explicit_deny'],
    });
  });

  it('requires download reason for high confidentiality downloads', async () => {
    const { service } = createService();
    service.target = { ...service.target!, confidentialityLevel: 'restricted' };
    service.explicitRows = [{ effect: 'ALLOW', condition_json: null }];

    await expect(
      service.canDownloadDocument({ tenantId, userId }, documentId),
    ).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'VALIDATION_FAILED',
    });

    await expect(
      service.canDownloadDocument({ tenantId, userId }, documentId, 'casework'),
    ).resolves.toMatchObject({ effect: 'ALLOW' });
  });

  it('denies wall exclusion before explicit allow can apply', async () => {
    const { service } = createService();
    service.wall = { blocked: true, appliedRules: ['ethical_wall:excluded'] };
    service.explicitRows = [{ effect: 'ALLOW', condition_json: null }];

    await expect(service.canReadDocument({ tenantId, userId }, documentId)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'ETHICAL_WALL_BLOCKED',
    });
  });
});
