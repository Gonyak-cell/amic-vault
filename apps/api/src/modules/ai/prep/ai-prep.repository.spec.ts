import { describe, expect, it, vi } from 'vitest';
import { AiPrepRepository } from './ai-prep.repository';

const sourceRow = {
  tenant_id: '11111111-1111-4111-8111-111111111111',
  document_id: '11111111-1111-4111-8111-111111111112',
  version_id: '11111111-1111-4111-8111-111111111113',
  matter_id: '11111111-1111-4111-8111-111111111114',
  created_by: '11111111-1111-4111-8111-111111111115',
  title: 'Fixture',
  chunk_id: '11111111-1111-4111-8111-111111111116',
  parent_chunk_id: '11111111-1111-4111-8111-111111111117',
  chunk_ordinal: 0,
  token_count: 12,
  chunk_text: 'bounded source',
  text_hash: '1'.repeat(64),
  source_text_hash: '2'.repeat(64),
};

describe('AiPrepRepository', () => {
  it('uses the search scope fragment when loading source chunks', async () => {
    const filterBuilder = {
      build: vi.fn(() => ({
        whereSql: 'WHERE (idx.tenant_id = $1) AND (idx.document_status <> $2)',
        params: [sourceRow.tenant_id, 'deleted'],
      })),
    };
    const repository = new AiPrepRepository(filterBuilder as never);
    const client = {
      query: vi.fn(async () => ({ rows: [sourceRow], rowCount: 1 })),
    };

    const source = await repository.findScopedSource(
      client,
      {
        tenantId: sourceRow.tenant_id,
        documentId: sourceRow.document_id,
        versionId: sourceRow.version_id,
        matterId: sourceRow.matter_id,
        artifactKind: 'document_profile',
      },
      { sql: 'idx.tenant_id = ?', params: [sourceRow.tenant_id] },
    );

    expect(filterBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { sql: 'idx.tenant_id = ?', params: [sourceRow.tenant_id] },
      }),
    );
    const firstCall = client.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(firstCall[0]).toContain('JOIN documents ai_doc');
    expect(source?.chunks).toHaveLength(1);
    expect(source?.chunks[0]?.sourceTextHash).toBe(sourceRow.source_text_hash);
  });

  it('marks scoped artifacts stale with allow-listed reasons only', async () => {
    const repository = new AiPrepRepository({ build: vi.fn() } as never);
    const client = {
      query: vi.fn(async () => ({
        rows: [
          {
            ai_prep_artifact_id: '11111111-1111-4111-8111-111111111119',
            artifact_kind: 'document_profile',
            matter_id: sourceRow.matter_id,
            document_id: sourceRow.document_id,
            document_version_id: sourceRow.version_id,
          },
        ],
        rowCount: 1,
      })),
    };

    const rows = await repository.markArtifactsStale(client, {
      tenantId: sourceRow.tenant_id,
      documentId: sourceRow.document_id,
      staleReason: 'document_ai_disabled',
    });

    expect(rows).toHaveLength(1);
    const firstCall = client.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(firstCall[0]).toContain('stale_reason = $2');
    expect(firstCall[0]).toContain('document_id = $3');
    expect(firstCall[1]).toEqual([
      sourceRow.tenant_id,
      'document_ai_disabled',
      sourceRow.document_id,
    ]);
  });

  it('rejects free-form stale reasons before issuing SQL', async () => {
    const repository = new AiPrepRepository({ build: vi.fn() } as never);
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    };

    await expect(
      repository.markArtifactsStale(client, {
        tenantId: sourceRow.tenant_id,
        documentId: sourceRow.document_id,
        staleReason: 'operator wrote a note' as never,
      }),
    ).rejects.toThrow();
    expect(client.query).not.toHaveBeenCalled();
  });
});
