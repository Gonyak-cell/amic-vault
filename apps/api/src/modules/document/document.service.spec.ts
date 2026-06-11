import { describe, expect, it, vi } from 'vitest';
import { allowPermission } from '@amic-vault/shared';
import { DocumentService } from './document.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const versionId = '11111111-1111-4111-8111-111111111144';

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    document_id: documentId,
    tenant_id: tenantId,
    matter_id: matterId,
    document_family_id: documentId,
    title: 'Draft Agreement',
    status: 'draft',
    document_type: 'contract',
    subtype: null,
    confidentiality_level: 'standard',
    privilege_status: 'none',
    legal_hold: false,
    version_id: versionId,
    created_by: actorUserId,
    created_at: new Date('2026-06-12T00:00:00.000Z'),
    updated_at: new Date('2026-06-12T00:00:00.000Z'),
    matter_status: 'active',
    ...overrides,
  };
}

describe('DocumentService', () => {
  it('creates a minimal draft document row', async () => {
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        expect(sql).toContain('INSERT INTO documents');
        expect(params).toEqual([
          documentId,
          tenantId,
          matterId,
          documentId,
          'Draft Agreement',
          'contract',
          'signed',
          'high',
          'privileged',
          actorUserId,
        ]);
        return {
          rowCount: 1,
          rows: [
            documentRow({
              subtype: 'signed',
              confidentiality_level: 'high',
              privilege_status: 'privileged',
            }),
          ],
        };
      },
    };

    await expect(
      new DocumentService().createDraft(
        {
          documentId,
          tenantId,
          matterId,
          documentFamilyId: documentId,
          title: 'Draft Agreement',
          documentType: 'contract',
          subtype: 'signed',
          confidentialityLevel: 'high',
          privilegeStatus: 'privileged',
          createdBy: actorUserId,
        },
        client as never,
      ),
    ).resolves.toMatchObject({
      status: 'draft',
      title: 'Draft Agreement',
      documentType: 'contract',
      subtype: 'signed',
      confidentialityLevel: 'high',
      privilegeStatus: 'privileged',
    });
  });

  it('updates metadata and writes reference-only audit in the same transaction', async () => {
    const updatedRow = documentRow({
      title: 'Updated Agreement',
      document_type: 'memo',
      confidentiality_level: 'restricted',
      updated_at: new Date('2026-06-12T00:01:00.000Z'),
    });
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [documentRow()] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [updatedRow] }),
    };
    const auditLog = vi.fn(async () => undefined);
    const transaction = vi.fn(
      async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const service = new DocumentService(
      { transaction, log: auditLog } as never,
      { canEditMatter: vi.fn(async () => allowPermission()) } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    const result = await service.updateMetadata(actorUserId, documentId, {
      title: 'Updated Agreement',
      documentType: 'memo',
      confidentialityLevel: 'restricted',
    });

    expect(result).toMatchObject({
      title: 'Updated Agreement',
      documentType: 'memo',
      confidentialityLevel: 'restricted',
    });
    expect(transaction).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_METADATA_CHANGED',
        metadata: expect.objectContaining({
          document_id: documentId,
          matter_id: matterId,
          diff_keys: ['title', 'document_type', 'confidentiality_level'],
          before_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
          after_ref: expect.stringMatching(/^document_metadata:[0-9a-f]{64}$/),
        }),
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Updated Agreement');
  });

  it('reads document detail through PermissionService and exposes extraction status only', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          documentRow({
            extraction_status: 'ocr_pending',
            extraction_method: 'ocr_required',
            extraction_confidence: 0,
          }),
        ],
      }),
    };
    const auditLog = vi.fn(async () => undefined);
    const canReadDocument = vi.fn(async () => allowPermission());
    const service = new DocumentService(
      {
        transaction: vi.fn(
          async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
        ),
        log: auditLog,
      } as never,
      { canReadDocument } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    const result = await service.getDocument(actorUserId, documentId);

    expect(canReadDocument).toHaveBeenCalledWith({ tenantId, userId: actorUserId }, documentId);
    expect(result).toMatchObject({
      documentId,
      extractionStatus: 'ocr_pending',
      extractionMethod: 'ocr_required',
      extractionConfidence: 0,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_VIEWED',
        metadata: {
          document_id: documentId,
          matter_id: matterId,
          version_id: versionId,
          channel: 'detail',
        },
      }),
      tx,
    );
    expect(JSON.stringify(result)).not.toContain('body_text');
  });
});
