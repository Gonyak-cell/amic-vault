import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission } from '@amic-vault/shared';
import { DocumentLifecycleService } from './document-lifecycle.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const versionId = '11111111-1111-4111-8111-111111111144';

function lifecycleRow(overrides: Record<string, unknown> = {}) {
  return {
    document_id: documentId,
    tenant_id: tenantId,
    matter_id: matterId,
    status: 'final',
    matter_status: 'active',
    document_legal_hold: false,
    matter_legal_hold: false,
    deleted_previous_status: null,
    ...overrides,
  };
}

function statusTransitionRow(overrides: Record<string, unknown> = {}) {
  return {
    ...lifecycleRow({ status: 'internal_review' }),
    ai_allowed: false,
    confidentiality_level: 'standard',
    created_at: new Date('2026-06-18T00:00:00.000Z'),
    created_by: actorUserId,
    document_family_id: '11111111-1111-4111-8111-111111111166',
    document_type: 'contract',
    extraction_confidence: null,
    extraction_method: null,
    extraction_status: null,
    legal_hold: false,
    matter_code: 'AMIC-2026-0001',
    matter_name: 'Status Transition Matter',
    privilege_status: 'none',
    source: 'internal_work_product',
    subtype: null,
    title: 'Status Transition Document',
    updated_at: new Date('2026-06-18T00:01:00.000Z'),
    ...overrides,
  };
}

function serviceWith(tx: { query: ReturnType<typeof vi.fn> }) {
  const auditLog = vi.fn(async () => undefined);
  const service = new DocumentLifecycleService(
    {
      transaction: vi.fn(
        async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
      ),
      log: auditLog,
    } as never,
    {
      canEditMatter: vi.fn(async () => allowPermission()),
      canDownloadDocument: vi.fn(async () => allowPermission()),
    } as never,
    {
      getByStorageUri: vi.fn(async () => ({
        key: 'k',
        contentLength: 5,
        contentType: 'application/pdf',
        etag: null,
        body: Readable.from(Buffer.from('hello')),
      })),
    } as never,
    {
      require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
    } as never,
    {
      findByTenantAndId: vi.fn(async () => ({ status: 'active', role: 'firm_admin' })),
    } as never,
  );
  return { service, auditLog };
}

describe('DocumentLifecycleService', () => {
  it('transitions status through domain rules and writes reference-only audit', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [lifecycleRow({ status: 'draft' })],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ document_id: documentId }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [statusTransitionRow({ status: 'internal_review' })],
        }),
    };
    const { service, auditLog } = serviceWith(tx);

    const result = await service.transitionStatus(
      actorUserId,
      documentId,
      'internal_review',
      'client free-form note',
    );

    expect(result).toMatchObject({
      documentId,
      status: 'internal_review',
      title: 'Status Transition Document',
    });
    expect(tx.query.mock.calls[1]?.[0]).toContain('UPDATE documents');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_STATUS_CHANGED',
        metadata: {
          document_id: documentId,
          matter_id: matterId,
          before_ref: 'document_status:draft',
          after_ref: 'document_status:internal_review',
          status_before: 'draft',
          status_after: 'internal_review',
          reason_code: 'status_transition_note',
        },
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('client free-form note');
  });

  it('rejects invalid direct status transitions before mutation', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [lifecycleRow({ status: 'draft' })],
      }),
    };
    const { service, auditLog } = serviceWith(tx);

    await expect(service.transitionStatus(actorUserId, documentId, 'executed')).rejects.toMatchObject(
      {
        response: {
          code: 'VALIDATION_FAILED',
          reason: 'DOCUMENT_STATUS_TRANSITION_NOT_ALLOWED',
        },
      },
    );
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('blocks status transitions while legal hold is active', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [lifecycleRow({ document_legal_hold: true, status: 'draft' })],
      }),
    };
    const { service, auditLog } = serviceWith(tx);

    await expect(
      service.transitionStatus(actorUserId, documentId, 'internal_review'),
    ).rejects.toMatchObject({
      response: { code: 'DOCUMENT_LOCKED', reason: 'DOCUMENT_LEGAL_HOLD' },
    });
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('soft deletes by status marker only and writes reference audit', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [lifecycleRow()] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const { service, auditLog } = serviceWith(tx);

    await service.softDelete(actorUserId, documentId);

    expect(tx.query.mock.calls[1]?.[0]).toContain("SET status = 'deleted'");
    expect(tx.query.mock.calls[1]?.[0]).not.toMatch(/DELETE\s+FROM\s+documents/i);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_DELETED',
        metadata: {
          document_id: documentId,
          matter_id: matterId,
          before_ref: 'document_status:final',
          after_ref: 'document_status:deleted',
        },
      }),
      tx,
    );
  });

  it('blocks legal-hold deletion before state mutation', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [lifecycleRow({ document_legal_hold: true })],
      }),
    };
    const { service, auditLog } = serviceWith(tx);

    await expect(service.softDelete(actorUserId, documentId)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_LOCKED' },
    });
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('restores the pre-delete status and audits the transition', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [lifecycleRow({ status: 'deleted', deleted_previous_status: 'executed' })],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const { service, auditLog } = serviceWith(tx);

    await service.restore(actorUserId, documentId);

    expect(tx.query.mock.calls[1]?.[1]).toEqual([tenantId, documentId, 'executed']);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_RESTORED',
        metadata: expect.objectContaining({
          before_ref: 'document_status:deleted',
          after_ref: 'document_status:executed',
        }),
      }),
      tx,
    );
  });

  it('records download audit before returning the current file stream', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          lifecycleRow({
            version_id: versionId,
            file_object_id: '11111111-1111-4111-8111-111111111155',
            storage_uri: 's3://amic-vault-dev/tenants/t/matters/m/documents/d/f',
            normalized_filename: 'download.pdf',
            mime_type: 'application/pdf',
            size_bytes: '5',
            sha256: 'abc123',
          }),
        ],
      }),
    };
    const { service, auditLog } = serviceWith(tx);

    const result = await service.download(actorUserId, documentId);

    expect(result).toMatchObject({
      contentType: 'application/pdf',
      contentLength: 5,
      filename: 'download.pdf',
      sha256: 'abc123',
    });
    expect(String(tx.query.mock.calls[0]?.[0])).toContain('FROM file_security_promotions promotion');
    expect(String(tx.query.mock.calls[0]?.[0])).toContain("scan.state = 'promoted'");
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_DOWNLOADED',
        metadata: {
          document_id: documentId,
          matter_id: matterId,
          version_id: versionId,
          hash: 'abc123',
        },
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('hello');
  });
});
