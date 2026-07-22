import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  SearchIndexRepository,
  type SearchEmbeddingGateway,
  truncateUtf8,
} from './search-index.repository';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111122';
const versionId = '11111111-1111-4111-8111-111111111133';
const matterId = '11111111-1111-4111-8111-111111111144';
const clientId = '11111111-1111-4111-8111-111111111155';
const parentChunkId = '11111111-1111-4111-8111-111111111177';
const childChunkId = '11111111-1111-4111-8111-111111111188';
const embedding1024 = Array.from({ length: 1024 }, (_value, index) => index / 1024);
const sourceBodyText = 'Confidential source body';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function generatedChunkId(index: number): string {
  return `11111111-1111-4111-8111-${(200 + index).toString().padStart(12, '0')}`;
}

function createClientMock(bodyText = sourceBodyText) {
  const truncatedContent = truncateUtf8(bodyText);
  const sourceTextHash = sha256Hex(bodyText);
  let callIndex = 0;
  let chunkIndex = 0;
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      void _params;
      callIndex += 1;
      if (callIndex === 1) {
        return {
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
              author_user_id: '11111111-1111-4111-8111-111111111199',
              ai_allowed: false,
              prev_version_id: null,
              next_version_id: null,
              title: 'Searchable title',
              body_text: bodyText,
              extraction_method: 'ocr',
              extraction_confidence: '0.700',
              document_updated_at: new Date('2026-06-11T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        };
      }
      if (callIndex === 2) {
        return {
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
              author_user_id: '11111111-1111-4111-8111-111111111199',
              ai_allowed: false,
              prev_version_id: null,
              next_version_id: null,
              title: 'Searchable title',
              content_text: truncatedContent,
              content_truncated: truncatedContent !== bodyText,
              extraction_confidence: '0.700',
              ocr_low_confidence: true,
              source_text_hash: sourceTextHash,
              indexed_at: new Date('2026-06-12T00:00:00.000Z'),
              updated_at: new Date('2026-06-11T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        };
      }
      if (String(sql).includes('RETURNING chunk_id')) {
        const chunkId =
          chunkIndex === 0 ? parentChunkId : chunkIndex === 1 ? childChunkId : generatedChunkId(chunkIndex);
        chunkIndex += 1;
        return { rows: [{ chunk_id: chunkId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('SearchIndexRepository', () => {
  it('truncates content by UTF-8 bytes without splitting characters', () => {
    expect(truncateUtf8('가나다', 4)).toBe('가');
  });

  it('upserts reference metadata and hashes full source text', async () => {
    const client = createClientMock();
    const embeddingGateway = {
      embedText: vi.fn(async (input: { text: string }) => {
        void input;
        return {
          status: 'completed' as const,
          route: 'bge_m3' as const,
          embedding: embedding1024,
        };
      }),
    } satisfies SearchEmbeddingGateway;

    const result = await new SearchIndexRepository(embeddingGateway).upsertVersion(client, {
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
      sourceTextHash: sha256Hex(sourceBodyText),
      contentTruncated: false,
      extractionConfidence: 0.7,
      ocrLowConfidence: true,
      updatedAt: new Date('2026-06-11T00:00:00.000Z'),
    });
    expect(String(client.query.mock.calls[0]?.[0])).toContain('FROM file_security_promotions promotion');
    expect(String(client.query.mock.calls[0]?.[0])).toContain("scan.state = 'promoted'");
    expect(client.query.mock.calls[1]?.[1]).not.toContain('body');
    expect(client.query.mock.calls[6]?.[1]).toContain(childChunkId);
    expect(embeddingGateway.embedText).toHaveBeenCalledWith({ text: 'Confidential source body' });
    const embeddingSql = String(client.query.mock.calls[6]?.[0]);
    const embeddingParams = client.query.mock.calls[6]?.[1] as unknown[];
    expect(embeddingSql).toContain('model_route');
    expect(embeddingParams[4]).toBe('bge_m3');
    expect(String(embeddingParams[5])).toMatch(/^\[0\.000000,0\.000977/);
    expect(embeddingParams[8]).toBe(false);
    expect(embeddingSql).toContain('stale = EXCLUDED.stale');
    expect(String(client.query.mock.calls[7]?.[0])).toContain('DELETE FROM document_chunk_embeddings');
    expect(client.query.mock.calls[7]?.[1]).toEqual([tenantId, versionId, 'bge_m3']);
  });

  it('stores a truncation flag while chunking the full source text', async () => {
    const tailPhrase = 'D6-tail-phrase-after-one-megabyte';
    const longBody = `${'a'.repeat(1024 * 1024 + 128)} ${tailPhrase}`;
    const client = createClientMock(longBody);
    const embeddingGateway = {
      embedText: vi.fn(async (input: { text: string }) => {
        void input;
        return {
          status: 'completed' as const,
          route: 'bge_m3' as const,
          embedding: embedding1024,
        };
      }),
    } satisfies SearchEmbeddingGateway;

    const result = await new SearchIndexRepository(embeddingGateway).upsertVersion(client, {
      tenantId,
      documentId,
      versionId,
    });

    const indexParams = client.query.mock.calls[1]?.[1] as unknown[];
    expect(result).toMatchObject({ contentTruncated: true });
    expect(indexParams[13]).not.toContain(tailPhrase);
    expect(indexParams[16]).toBe(true);
    expect(embeddingGateway.embedText.mock.calls.some(([input]) => input.text.includes(tailPhrase))).toBe(
      true,
    );
  });

  it('keeps indexing successful and records a stale bge_m3 row when embedding is unavailable', async () => {
    const client = createClientMock();
    const embeddingGateway = {
      embedText: vi.fn(async (input: { text: string }) => {
        void input;
        return {
          status: 'blocked' as const,
          route: 'bge_m3' as const,
          reasonCode: 'embedding_timeout' as const,
        };
      }),
    } satisfies SearchEmbeddingGateway;

    await expect(
      new SearchIndexRepository(embeddingGateway).upsertVersion(client, {
        tenantId,
        documentId,
        versionId,
      }),
    ).resolves.toMatchObject({ tenantId, documentId, versionId });

    const embeddingParams = client.query.mock.calls[6]?.[1] as unknown[];
    expect(embeddingParams[4]).toBe('bge_m3');
    expect(String(embeddingParams[5])).toMatch(/^\[0\.000000,0\.000000/);
    expect(embeddingParams[8]).toBe(true);
    expect(String(client.query.mock.calls[6]?.[0])).toContain('stale = EXCLUDED.stale');
  });
});
