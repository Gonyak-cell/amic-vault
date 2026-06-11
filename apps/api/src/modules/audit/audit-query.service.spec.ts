import { describe, expect, it } from 'vitest';
import {
  allowPermission,
  denyPermission,
  type DocumentAuditQueryDto,
  type PermissionContext,
  type PermissionDecision,
  type TenantId,
} from '@amic-vault/shared';
import { AuditQueryService } from './audit-query.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const documentId = '11111111-1111-4111-8111-1111111111dd';
const matterId = '11111111-1111-4111-8111-1111111111aa';

function auditQuery(overrides: Partial<DocumentAuditQueryDto> = {}): DocumentAuditQueryDto {
  return {
    eventType: undefined,
    from: undefined,
    to: undefined,
    limit: 50,
    cursor: undefined,
    ...overrides,
  };
}

class TestAuditQueryService extends AuditQueryService {
  decision: PermissionDecision = allowPermission();
  request: { context: PermissionContext; matterId: string } | null = null;
  target: { documentId: string; matterId: string } | null = { documentId, matterId };

  constructor() {
    super(
      { require: () => ({ tenantId }) } as never,
      {
        canReadDocumentAudit: async (context: PermissionContext, targetMatterId: string) => {
          this.request = { context, matterId: targetMatterId };
          return this.decision;
        },
      },
    );
  }

  protected override async findDocumentTarget() {
    return this.target;
  }

  protected override async findDocumentAuditEvents() {
    return [
      {
        event_id: '11111111-1111-4111-8111-1111111111e2',
        action: 'DOCUMENT_VIEWED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        result: 'success' as const,
        target_type: 'document' as const,
        target_id: documentId,
        matter_id: matterId,
        metadata_json: { document_id: documentId, matter_id: matterId, channel: 'detail' },
        created_at: new Date('2026-06-12T00:00:02.000Z'),
      },
      {
        event_id: '11111111-1111-4111-8111-1111111111e1',
        action: 'DOCUMENT_UPLOADED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        result: 'success' as const,
        target_type: 'document' as const,
        target_id: documentId,
        matter_id: matterId,
        metadata_json: { document_id: documentId, matter_id: matterId },
        created_at: new Date('2026-06-12T00:00:01.000Z'),
      },
    ];
  }
}

describe('AuditQueryService', () => {
  it('delegates authorization to PermissionService and returns a stable cursor', async () => {
    const service = new TestAuditQueryService();
    const result = await service.listDocumentEvents(
      actorUserId,
      documentId,
      auditQuery({ limit: 1 }),
    );

    expect(service.request).toEqual({ context: { tenantId, userId: actorUserId }, matterId });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      action: 'DOCUMENT_VIEWED',
      targetId: documentId,
      metadata: { channel: 'detail' },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('maps denied PermissionService decisions to safe permission denial', async () => {
    const service = new TestAuditQueryService();
    service.decision = denyPermission('PERMISSION_DENIED');
    await expect(service.listDocumentEvents(actorUserId, documentId, auditQuery())).rejects
      .toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('fails closed when the target document is hidden from the tenant', async () => {
    const service = new TestAuditQueryService();
    service.target = null;

    await expect(service.listDocumentEvents(actorUserId, documentId, auditQuery())).rejects
      .toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(service.request).toBeNull();
  });
});
