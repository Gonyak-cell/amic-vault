import { describe, expect, it, vi } from 'vitest';
import { SearchIndexRepository, truncateUtf8 } from './search-index.repository';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111122';
const versionId = '11111111-1111-4111-8111-111111111133';
const matterId = '11111111-1111-4111-8111-111111111144';
const clientId = '11111111-1111-4111-8111-111111111155';
const parentChunkId = '11111111-1111-4111-8111-111111111177';
const childChunkId = '11111111-1111-4111-8111-111111111188';

describe('SearchIndexRepository', () => {
  it('truncates content by UTF-8 bytes without splitting characters', () => {
    expect(truncateUtf8('가나다', 4)).toBe('가');
  });

  it('upserts reference metadata and hashes full source text', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              tenant_id: tenantId,
              document_id: documentId,
              version_id: versionId,
              matter_id: matterId,
              client_id: clientId,
              document_type: 'contract',
              document_status: 'draft',
              version_status: 'current',
              title: 'Searchable title',
              body_text: 'Confidential source body',
              document_updated_at: new Date('2026-06-11T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              index_id: '11111111-1111-4111-8111-111111111166',
              tenant_id: tenantId,
              document_id: documentId,
              version_id: versionId,
              matter_id: matterId,
              client_id: clientId,
              document_type: 'contract',
              document_status: 'draft',
              version_status: 'current',
              title: 'Searchable title',
              content_text: 'Confidential source body',
              source_text_hash:
                '8aa3af6ab56a83bf453038fa57b2ae8fc426e2ef4eec3e3d2d687ddd0d3d20d9',
              indexed_at: new Date('2026-06-12T00:00:00.000Z'),
              updated_at: new Date('2026-06-11T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ chunk_id: parentChunkId }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ chunk_id: childChunkId }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        }),
    };

    const result = await new SearchIndexRepository().upsertVersion(client, {
      tenantId,
      documentId,
      versionId,
    });

    expect(result).toMatchObject({
      tenantId,
      documentId,
      versionId,
      matterId,
      clientId,
      sourceTextHash: '8aa3af6ab56a83bf453038fa57b2ae8fc426e2ef4eec3e3d2d687ddd0d3d20d9',
      updatedAt: new Date('2026-06-11T00:00:00.000Z'),
    });
    expect(client.query.mock.calls[1]?.[1]).not.toContain('body');
    expect(client.query.mock.calls[6]?.[1]).toContain(childChunkId);
  });
});
