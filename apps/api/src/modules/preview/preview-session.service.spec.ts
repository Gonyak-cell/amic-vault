import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { PreviewSessionService, type PreviewSessionTarget } from './preview-session.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const documentId = '11111111-1111-4111-8111-111111111133';
const versionId = '11111111-1111-4111-8111-111111111155';

const target: PreviewSessionTarget = {
  document_id: documentId,
  file_object_id: '11111111-1111-4111-8111-111111111144',
  matter_id: '11111111-1111-4111-8111-111111111199',
  mime_type: 'application/pdf',
  normalized_filename: 'advice.pdf',
  sha256: 'a'.repeat(64),
  size_bytes: '7',
  status: 'active',
  storage_uri: 'tenant/matter/document/version',
  tenant_id: tenantId,
  version_id: versionId,
};

function createService(
  query: QueryClient['query'],
  permissionEffect: 'ALLOW' | 'DENY' = 'ALLOW',
) {
  const client = { query } satisfies QueryClient;
  const auditService = {
    log: vi.fn(async () => ({
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
      eventId: '11111111-1111-4111-8111-111111111188',
    })),
    transaction: vi.fn(async (_tenant: string, run: (tx: QueryClient) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as AuditService;
  const canReadDocument = vi.fn(async () => ({ appliedRules: [], effect: permissionEffect }));
  const permissionService = { canReadDocument } as unknown as PermissionService;
  const tenantContext = new TenantContextService();
  return {
    auditService,
    canReadDocument,
    service: new PreviewSessionService(auditService, permissionService, tenantContext),
    tenantContext,
  };
}

function inTenantContext<T>(tenantContext: TenantContextService, callback: () => Promise<T>) {
  return tenantContext.run(
    { slug: 'test-firm', source: 'session', status: 'active', tenantId },
    callback,
  );
}

describe('PreviewSessionService', () => {
  it('issues one bounded opaque session and records exactly one document view audit', async () => {
    const expiresAt = new Date('2026-07-22T00:05:00.000Z');
    const query = vi
      .fn<QueryClient['query']>()
      .mockResolvedValueOnce({ rowCount: 1, rows: [target] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            expires_at: expiresAt,
            preview_session_id: '11111111-1111-4111-8111-111111111177',
          },
        ],
      });
    const { auditService, canReadDocument, service, tenantContext } = createService(query);

    const issued = await inTenantContext(tenantContext, () => service.issue(actorUserId, documentId));

    expect(issued).toEqual({
      expiresAt: expiresAt.toISOString(),
      previewSessionId: '11111111-1111-4111-8111-111111111177',
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(canReadDocument).toHaveBeenCalledWith({ tenantId, userId: actorUserId }, documentId);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("now() + interval '5 minutes'"), [
      tenantId,
      actorUserId,
      documentId,
      versionId,
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    ]);
    const insertParams = vi.mocked(query).mock.calls[1]?.[1];
    expect(insertParams).toHaveLength(5);
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_VIEWED',
        actorId: actorUserId,
        matterId: target.matter_id,
        targetId: documentId,
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(vi.mocked(auditService.log).mock.calls[0]?.[0])).not.toContain(issued.token);
  });

  it('fails closed before inserting a session or auditing when PermissionService denies', async () => {
    const query = vi.fn<QueryClient['query']>().mockResolvedValue({ rowCount: 1, rows: [target] });
    const { auditService, service, tenantContext } = createService(query, 'DENY');

    await expect(inTenantContext(tenantContext, () => service.issue(actorUserId, documentId))).rejects.toMatchObject({
      status: 404,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('fails closed before inserting a session or auditing when PermissionService throws', async () => {
    const query = vi.fn<QueryClient['query']>().mockResolvedValue({ rowCount: 1, rows: [target] });
    const { auditService, canReadDocument, service, tenantContext } = createService(query);
    canReadDocument.mockRejectedValueOnce(new Error('permission evaluator unavailable'));

    await expect(inTenantContext(tenantContext, () => service.issue(actorUserId, documentId))).rejects.toMatchObject({
      status: 404,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects an unbound stream credential without producing a second view audit', async () => {
    const query = vi
      .fn<QueryClient['query']>()
      .mockResolvedValueOnce({ rowCount: 1, rows: [target] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { auditService, service, tenantContext } = createService(query);

    await expect(
      inTenantContext(tenantContext, () =>
        service.authorizeStream(
          actorUserId,
          documentId,
          '11111111-1111-4111-8111-111111111177',
          '1234567890123456789012345678901234567890123',
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('revokes only unrevoked preview sessions on the caller transaction', async () => {
    const query = vi.fn<QueryClient['query']>().mockResolvedValue({ rowCount: 2, rows: [] });
    const { service } = createService(query);
    const client = { query } satisfies QueryClient;

    await service.revokeAllForUser(tenantId, actorUserId, client);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND revoked_at IS NULL'),
      [tenantId, actorUserId],
    );
  });
});
