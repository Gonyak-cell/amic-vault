import { describe, expect, it, vi } from 'vitest';
import {
  allowPermission,
  type AuditQueryDto,
  denyPermission,
  type DocumentAuditQueryDto,
  type MatterAuditQueryDto,
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

function matterAuditQuery(overrides: Partial<MatterAuditQueryDto> = {}): MatterAuditQueryDto {
  return {
    action: undefined,
    result: undefined,
    from: undefined,
    to: undefined,
    limit: 8,
    cursor: undefined,
    ...overrides,
  };
}

class TestAuditQueryService extends AuditQueryService {
  decision: PermissionDecision = allowPermission();
  request: { context: PermissionContext; matterId: string } | null = null;
  target: { documentId: string; matterId: string } | null = { documentId, matterId };
  auditLog = vi.fn(async () => ({
    eventId: '11111111-1111-4111-8111-111111111199',
    createdAt: new Date('2026-06-12T00:00:03.000Z'),
  }));
  assertedTargets: Array<{
    matterId: string | undefined;
    targetType: string | undefined;
    targetId: string | undefined;
  }> = [];

  constructor() {
    super(
      { require: () => ({ tenantId }) } as never,
      {
        log: async (...args: Parameters<typeof this.auditLog>) => this.auditLog(...args),
        transaction: async (_tenantId: string, run: (client: never) => Promise<unknown>) =>
          run({} as never),
      } as never,
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
        actor_name: '조우상',
        actor_email: 'jwsuh@amic.kr',
        session_id: '11111111-1111-4111-8111-1111111111f2',
        result: 'success' as const,
        target_type: 'document' as const,
        target_id: documentId,
        target_display_name: 'Draft Agreement',
        target_display_code: null,
        matter_id: matterId,
        matter_display_name: 'Vault UI',
        matter_display_code: 'AMIC-2026',
        metadata_json: { document_id: documentId, matter_id: matterId, channel: 'detail' },
        created_at: new Date('2026-06-12T00:00:02.000Z'),
      },
      {
        event_id: '11111111-1111-4111-8111-1111111111e1',
        action: 'DOCUMENT_UPLOADED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        actor_name: '조우상',
        actor_email: 'jwsuh@amic.kr',
        session_id: '11111111-1111-4111-8111-1111111111f1',
        result: 'success' as const,
        target_type: 'document' as const,
        target_id: documentId,
        target_display_name: 'Draft Agreement',
        target_display_code: null,
        matter_id: matterId,
        matter_display_name: 'Vault UI',
        matter_display_code: 'AMIC-2026',
        metadata_json: { document_id: documentId, matter_id: matterId },
        created_at: new Date('2026-06-12T00:00:01.000Z'),
      },
      {
        event_id: '11111111-1111-4111-8111-1111111111e0',
        action: 'RECORD_ARCHIVED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        actor_name: '조우상',
        actor_email: 'jwsuh@amic.kr',
        session_id: '11111111-1111-4111-8111-1111111111f0',
        result: 'success' as const,
        target_type: 'document' as const,
        target_id: documentId,
        target_display_name: 'Draft Agreement',
        target_display_code: null,
        matter_id: matterId,
        matter_display_name: 'Vault UI',
        matter_display_code: 'AMIC-2026',
        metadata_json: {
          archive_id: '11111111-1111-4111-8111-111111111177',
          document_id: documentId,
          matter_id: matterId,
          reason_code: 'client_records',
        },
        created_at: new Date('2026-06-12T00:00:00.000Z'),
      },
    ];
  }

  protected override async findTenantAuditEvents() {
    return [
      {
        event_id: '11111111-1111-4111-8111-1111111111e2',
        action: 'DOCUMENT_VIEWED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        actor_name: '조우상',
        actor_email: 'jwsuh@amic.kr',
        session_id: '11111111-1111-4111-8111-1111111111f2',
        result: 'success' as const,
        target_type: 'document',
        target_id: documentId,
        target_display_name: 'Draft Agreement',
        target_display_code: null,
        matter_id: matterId,
        matter_display_name: 'Vault UI',
        matter_display_code: 'AMIC-2026',
        metadata_json: { document_id: documentId, matter_id: matterId, channel: 'detail' },
        created_at: new Date('2026-06-12T00:00:02.000Z'),
      },
      {
        event_id: '11111111-1111-4111-8111-1111111111e1',
        action: 'DOCUMENT_UPLOADED' as const,
        actor_type: 'user' as const,
        actor_id: actorUserId,
        actor_name: '조우상',
        actor_email: 'jwsuh@amic.kr',
        session_id: null,
        result: 'success' as const,
        target_type: 'document',
        target_id: documentId,
        target_display_name: 'Draft Agreement',
        target_display_code: null,
        matter_id: matterId,
        matter_display_name: 'Vault UI',
        matter_display_code: 'AMIC-2026',
        metadata_json: { document_id: documentId, matter_id: matterId },
        created_at: new Date('2026-06-12T00:00:01.000Z'),
      },
    ];
  }

  protected override async assertTargetFiltersTenantScoped(
    _client: never,
    _tenantId: TenantId,
    query: Pick<AuditQueryDto, 'matterId' | 'targetType' | 'targetId'>,
  ) {
    this.assertedTargets.push({
      matterId: query.matterId,
      targetType: query.targetType,
      targetId: query.targetId,
    });
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
      actorDisplayName: '조우상',
      targetDisplayName: 'Draft Agreement',
      matterDisplayCode: 'AMIC-2026',
      safeLabel: 'Draft Agreement',
      metadata: { channel: 'detail' },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('maps denied PermissionService decisions to safe permission denial', async () => {
    const service = new TestAuditQueryService();
    service.decision = denyPermission('PERMISSION_DENIED');
    await expect(
      service.listDocumentEvents(actorUserId, documentId, auditQuery()),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('includes document-target Records lifecycle rows in document timelines', async () => {
    const service = new TestAuditQueryService();
    const result = await service.listDocumentEvents(
      actorUserId,
      documentId,
      auditQuery({ eventType: 'RECORD_ARCHIVED', limit: 3 }),
    );

    expect(result.items.map((item) => item.action)).toContain('RECORD_ARCHIVED');
    expect(result.items.find((item) => item.action === 'RECORD_ARCHIVED')).toMatchObject({
      targetType: 'document',
      targetId: documentId,
      safeLabel: 'Draft Agreement',
      metadata: expect.objectContaining({
        archive_id: '11111111-1111-4111-8111-111111111177',
        reason_code: 'client_records',
      }),
    });
  });

  it('fails closed when the target document is hidden from the tenant', async () => {
    const service = new TestAuditQueryService();
    service.target = null;

    await expect(
      service.listDocumentEvents(actorUserId, documentId, auditQuery()),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(service.request).toBeNull();
  });

  it('lists matter-scoped audit rows through audit.read.matter permission without console audit side effects', async () => {
    const service = new TestAuditQueryService();
    const result = await service.listMatterEvents(
      actorUserId,
      matterId,
      matterAuditQuery({ action: 'DOCUMENT_VIEWED', limit: 1 }),
    );

    expect(service.request).toEqual({ context: { tenantId, userId: actorUserId }, matterId });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      action: 'DOCUMENT_VIEWED',
      targetType: 'document',
      targetDisplayName: 'Draft Agreement',
      matterDisplayCode: 'AMIC-2026',
      safeLabel: 'Draft Agreement',
      metadata: { channel: 'detail' },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(service.auditLog).not.toHaveBeenCalled();
  });

  it('lists tenant audit rows with target preflight and records a reference-only query audit', async () => {
    const service = new TestAuditQueryService();
    const result = await service.listTenantEvents(actorUserId, {
      actorId: actorUserId,
      action: 'DOCUMENT_VIEWED',
      result: undefined,
      targetType: 'document',
      targetId: documentId,
      matterId,
      from: '2026-06-12T00:00:00.000Z',
      to: undefined,
      limit: 1,
      cursor: undefined,
    });

    expect(service.assertedTargets).toEqual([
      { matterId, targetType: 'document', targetId: documentId },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      action: 'DOCUMENT_VIEWED',
      sessionId: '11111111-1111-4111-8111-1111111111f2',
      actorDisplayEmail: 'jwsuh@amic.kr',
      targetDisplayName: 'Draft Agreement',
      matterDisplayName: 'Vault UI',
      safeLabel: 'Draft Agreement',
      metadata: { channel: 'detail' },
    });
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(service.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUDIT_QUERY_EXECUTED',
        targetType: 'audit_console',
        metadata: expect.objectContaining({
          scope_type: 'tenant_audit',
          filter_refs: expect.stringContaining(`target_id:${documentId}`),
          result_count: 1,
        }),
      }),
    );
  });

  it('exports only whitelisted CSV fields and audits the export', async () => {
    const service = new TestAuditQueryService();
    const result = await service.exportTenantEvents(actorUserId, {
      actorId: undefined,
      action: undefined,
      result: undefined,
      targetType: undefined,
      targetId: undefined,
      matterId: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      cursor: undefined,
    });

    expect(result.rowCount).toBe(2);
    expect(result.csv.split('\n')[0]).toBe(
      'event_id,created_at,action,result,actor_type,actor_id,target_type,target_id,matter_id,session_id',
    );
    expect(result.csv).toContain('DOCUMENT_VIEWED');
    expect(result.csv).not.toContain('metadata_json');
    expect(result.csv).not.toContain('channel');
    expect(service.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUDIT_EXPORT_CREATED',
        targetType: 'audit_export',
        metadata: expect.objectContaining({
          export_format: 'csv',
          result_count: 2,
        }),
      }),
    );
  });
});
