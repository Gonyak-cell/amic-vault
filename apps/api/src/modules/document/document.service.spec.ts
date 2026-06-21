import { BadRequestException } from '@nestjs/common';
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
    ai_allowed: false,
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
          false,
          actorUserId,
        ]);
        return {
          rowCount: 1,
          rows: [
            documentRow({
              subtype: 'signed',
              confidentiality_level: 'high',
              privilege_status: 'privileged',
              ai_allowed: false,
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
      aiAllowed: false,
    });
  });

  it('stores explicit upload prep consent on draft creation', async () => {
    const client = {
      async query(_sql: string, params?: readonly unknown[]) {
        expect(params?.[9]).toBe(true);
        return {
          rowCount: 1,
          rows: [
            documentRow({
              ai_allowed: true,
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
          aiAllowed: true,
          createdBy: actorUserId,
        },
        client as never,
      ),
    ).resolves.toMatchObject({
      aiAllowed: true,
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
        .mockResolvedValueOnce({ rowCount: 1, rows: [updatedRow] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              ai_prep_artifact_id: '11111111-1111-4111-8111-111111111199',
              artifact_kind: 'document_profile',
              matter_id: matterId,
              document_id: documentId,
              document_version_id: '11111111-1111-4111-8111-111111111198',
            },
          ],
        }),
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
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_PREP_STALE',
        metadata: expect.objectContaining({
          stale_reason: 'document_metadata_changed',
          ai_prep_status: 'stale',
        }),
      }),
      tx,
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Updated Agreement');
  });

  it('blocks metadata mutation when Matter source policy fails closed', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [documentRow()] }),
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
      undefined,
      undefined,
      undefined,
      {
        assertMatterSourceMutationAllowed: vi.fn(async () => {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            reason: 'MATTER_SOURCE_UNAVAILABLE',
          });
        }),
      } as never,
    );

    await expect(
      service.updateMetadata(actorUserId, documentId, { title: 'Updated Agreement' }),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
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

  it('lists matter documents through the query-stage search permission scope', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          documentRow({
            matter_name: 'Investment Advisory',
            matter_code: 'AMIC-2026-0001',
            total: '1',
          }),
        ],
      }),
    };
    const transaction = vi.fn(
      async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const scopeForSearch = vi.fn(async () => ({
      effect: 'ALLOW' as const,
      scope: {
        sql: 'idx.tenant_id = ? AND idx.document_status <> ?',
        params: [tenantId, 'deleted'],
      },
    }));
    const service = new DocumentService(
      { transaction, log: vi.fn(async () => undefined) } as never,
      undefined,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
      undefined,
      undefined,
      { scopeForSearch } as never,
    );

    const result = await service.listMatterDocuments(actorUserId, matterId, {
      page: 1,
      pageSize: 20,
    });

    expect(scopeForSearch).toHaveBeenCalledWith({ tenantId, userId: actorUserId });
    expect(tx.query).toHaveBeenCalledOnce();
    const [sql, params] = tx.query.mock.calls[0] ?? [];
    expect(sql).toContain('FROM document_search_index idx');
    expect(sql).toContain('(idx.tenant_id = $1 AND idx.document_status <> $2)');
    expect(sql).toContain('AND idx.matter_id = $3::uuid');
    expect(params).toEqual([tenantId, 'deleted', matterId, 'deleted', 'current', 20, 0]);
    expect(result).toMatchObject({
      totalCount: 1,
      page: 1,
      pageSize: 20,
      items: [
        {
          documentId,
          matterDisplayCode: 'AMIC-2026-0001',
          matterDisplayName: 'Investment Advisory',
          title: 'Draft Agreement',
        },
      ],
    });
  });

  it('denies matter document listing before a database list query when scope fails closed', async () => {
    const transaction = vi.fn();
    const service = new DocumentService(
      { transaction, log: vi.fn(async () => undefined) } as never,
      undefined,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
      undefined,
      undefined,
      {
        scopeForSearch: vi.fn(async () => ({ effect: 'DENY', reasonCode: 'DENY_ALL' })),
      } as never,
    );

    await expect(
      service.listMatterDocuments(actorUserId, matterId, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lists all authorized documents through the query-stage search permission scope', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          documentRow({
            matter_name: 'Investment Advisory',
            matter_code: 'AMIC-2026-0001',
            total: '1',
          }),
        ],
      }),
    };
    const transaction = vi.fn(
      async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const scopeForSearch = vi.fn(async () => ({
      effect: 'ALLOW' as const,
      scope: {
        sql: 'idx.tenant_id = ? AND idx.document_status <> ?',
        params: [tenantId, 'deleted'],
      },
    }));
    const service = new DocumentService(
      { transaction, log: vi.fn(async () => undefined) } as never,
      undefined,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
      undefined,
      undefined,
      { scopeForSearch } as never,
    );

    const result = await service.listDocuments(actorUserId, {
      page: 1,
      pageSize: 20,
    });

    expect(scopeForSearch).toHaveBeenCalledWith({ tenantId, userId: actorUserId });
    expect(tx.query).toHaveBeenCalledOnce();
    const [sql, params] = tx.query.mock.calls[0] ?? [];
    expect(sql).toContain('FROM document_search_index idx');
    expect(sql).toContain('(idx.tenant_id = $1 AND idx.document_status <> $2)');
    expect(sql).not.toContain('AND idx.matter_id =');
    expect(params).toEqual([tenantId, 'deleted', 'deleted', 'current', 20, 0]);
    expect(result).toMatchObject({
      totalCount: 1,
      page: 1,
      pageSize: 20,
      items: [
        {
          documentId,
          matterDisplayCode: 'AMIC-2026-0001',
          matterDisplayName: 'Investment Advisory',
          title: 'Draft Agreement',
        },
      ],
    });
  });

  it('applies document vault filters inside the permission-scoped list query', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      }),
    };
    const transaction = vi.fn(
      async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );
    const scopeForSearch = vi.fn(async () => ({
      effect: 'ALLOW' as const,
      scope: {
        sql: 'idx.tenant_id = ? AND idx.document_status <> ?',
        params: [tenantId, 'deleted'],
      },
    }));
    const service = new DocumentService(
      { transaction, log: vi.fn(async () => undefined) } as never,
      undefined,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
      undefined,
      undefined,
      { scopeForSearch } as never,
    );

    await service.listDocuments(actorUserId, {
      aiAllowed: true,
      confidentialityLevel: 'restricted',
      documentType: 'contract',
      extractionStatus: 'failed',
      legalHold: false,
      matterCode: 'AMIC-2026',
      page: 2,
      pageSize: 10,
      privilegeStatus: 'privileged',
      sortBy: 'matter_asc',
      status: 'final',
      title: 'Agreement_100%',
    });

    const [sql, params] = tx.query.mock.calls[0] ?? [];
    expect(sql).toContain('AND idx.title ILIKE $5');
    expect(sql).toContain("ESCAPE '\\'");
    expect(sql).toContain('AND m.matter_code ILIKE $6');
    expect(sql).toContain('AND idx.document_type = $7');
    expect(sql).toContain('AND doc.status = $8');
    expect(sql).toContain('AND doc.confidentiality_level = $9');
    expect(sql).toContain('AND doc.privilege_status = $10');
    expect(sql).toContain("AND coalesce(cd.extraction_status, 'pending') = $11");
    expect(sql).toContain('AND doc.ai_allowed = $12');
    expect(sql).toContain('AND doc.legal_hold = $13');
    expect(sql).toContain("ORDER BY lower(coalesce(m.matter_code, '')) ASC");
    expect(params).toEqual([
      tenantId,
      'deleted',
      'deleted',
      'current',
      '%Agreement\\_100\\%%',
      '%AMIC-2026%',
      'contract',
      'final',
      'restricted',
      'privileged',
      'failed',
      true,
      false,
      10,
      10,
    ]);
  });

  it('denies all-document listing before a database list query when scope fails closed', async () => {
    const transaction = vi.fn();
    const service = new DocumentService(
      { transaction, log: vi.fn(async () => undefined) } as never,
      undefined,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
      undefined,
      undefined,
      {
        scopeForSearch: vi.fn(async () => ({ effect: 'DENY', reasonCode: 'DENY_ALL' })),
      } as never,
    );

    await expect(
      service.listDocuments(actorUserId, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
