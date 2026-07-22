import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  LocalEmbeddingGateway,
  localEmbeddingDefaultModel,
  type LocalEmbeddingInput,
  type LocalEmbeddingResult,
} from '@amic-vault/ai';
import type { QueryClient } from '../../audit/audit.service';
import { promotedDocumentExistsSql } from '../../file-security/promoted-file.guard';
import { buildParentChildChunks, type BuiltDocumentChunk } from '../semantic/document-chunker';
import {
  embeddingHash,
  vectorToSqlLiteral,
  zeroEmbeddingVector,
} from '../semantic/local-embedding';

const maxIndexedContentBytes = 1024 * 1024;
export const searchEmbeddingModelRoute = 'bge_m3';
export const SEARCH_EMBEDDING_GATEWAY = Symbol('SEARCH_EMBEDDING_GATEWAY');

export interface SearchIndexRow {
  indexId: string;
  tenantId: string;
  documentId: string;
  versionId: string;
  matterId: string;
  clientId: string;
  authorUserId: string;
  aiAllowed: boolean;
  documentType: string;
  documentStatus: string;
  versionStatus: string;
  prevVersionId: string | null;
  nextVersionId: string | null;
  title: string;
  contentText: string;
  contentTruncated: boolean;
  extractionConfidence: number | null;
  ocrLowConfidence: boolean;
  sourceTextHash: string;
  indexedAt: Date;
  updatedAt: Date;
}

interface SearchIndexSourceRow {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  client_id: string;
  author_user_id: string;
  ai_allowed: boolean;
  document_type: string;
  document_status: string;
  version_status: string;
  prev_version_id: string | null;
  next_version_id: string | null;
  title: string;
  body_text: string | null;
  extraction_method: string | null;
  extraction_confidence: number | string | null;
  document_updated_at: Date;
}

interface SearchIndexDbRow {
  index_id: string;
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  client_id: string;
  author_user_id: string;
  ai_allowed: boolean;
  document_type: string;
  document_status: string;
  version_status: string;
  prev_version_id: string | null;
  next_version_id: string | null;
  title: string;
  content_text: string;
  content_truncated: boolean;
  extraction_confidence: number | string | null;
  ocr_low_confidence: boolean;
  source_text_hash: string;
  indexed_at: Date;
  updated_at: Date;
}

interface ChunkDbRow {
  chunk_id: string;
}

export interface SearchEmbeddingGateway {
  embedText(input: LocalEmbeddingInput): Promise<LocalEmbeddingResult>;
}

export function truncateUtf8(input: string, maxBytes = maxIndexedContentBytes): string {
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input;
  let bytes = 0;
  let output = '';
  for (const char of input) {
    const next = Buffer.byteLength(char, 'utf8');
    if (bytes + next > maxBytes) break;
    bytes += next;
    output += char;
  }
  return output;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function mapRow(row: SearchIndexDbRow): SearchIndexRow {
  return {
    indexId: row.index_id,
    tenantId: row.tenant_id,
    documentId: row.document_id,
    versionId: row.version_id,
    matterId: row.matter_id,
    clientId: row.client_id,
    authorUserId: row.author_user_id,
    aiAllowed: row.ai_allowed,
    documentType: row.document_type,
    documentStatus: row.document_status,
    versionStatus: row.version_status,
    prevVersionId: row.prev_version_id,
    nextVersionId: row.next_version_id,
    title: row.title,
    contentText: row.content_text,
    contentTruncated: row.content_truncated,
    extractionConfidence:
      row.extraction_confidence === null ? null : Number(row.extraction_confidence),
    ocrLowConfidence: row.ocr_low_confidence,
    sourceTextHash: row.source_text_hash,
    indexedAt: row.indexed_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class SearchIndexRepository {
  private readonly embeddingGateway: SearchEmbeddingGateway;

  constructor(
    @Optional()
    @Inject(SEARCH_EMBEDDING_GATEWAY)
    embeddingGateway?: SearchEmbeddingGateway,
  ) {
    this.embeddingGateway = embeddingGateway ?? createDefaultSearchEmbeddingGateway();
  }

  async upsertVersion(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string },
  ): Promise<SearchIndexRow | null> {
    const source = await this.findSource(client, input);
    if (!source) return null;
    const contentText = source.body_text ?? '';
    const extractionConfidence =
      source.extraction_confidence === null ? null : Number(source.extraction_confidence);
    const ocrLowConfidence =
      source.extraction_method === 'ocr' &&
      extractionConfidence !== null &&
      extractionConfidence < 0.8;
    const sourceTextHash = sha256Hex(contentText);
    const truncatedContent = truncateUtf8(contentText);
    const contentTruncated = truncatedContent !== contentText;

    const result = await client.query(
      `
        INSERT INTO document_search_index (
          tenant_id, document_id, version_id, matter_id, client_id, document_type,
          document_status, version_status, author_user_id, ai_allowed, prev_version_id,
          next_version_id, title, content_text, fts_config, extraction_confidence,
          ocr_low_confidence, content_truncated, source_text_hash, indexed_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'simple',
          $15, $16, $17, $18, now(), $19
        )
        ON CONFLICT (tenant_id, version_id)
        DO UPDATE SET
          matter_id = EXCLUDED.matter_id,
          client_id = EXCLUDED.client_id,
          document_type = EXCLUDED.document_type,
          document_status = EXCLUDED.document_status,
          version_status = EXCLUDED.version_status,
          author_user_id = EXCLUDED.author_user_id,
          ai_allowed = EXCLUDED.ai_allowed,
          prev_version_id = EXCLUDED.prev_version_id,
          next_version_id = EXCLUDED.next_version_id,
          title = EXCLUDED.title,
          content_text = EXCLUDED.content_text,
          fts_config = EXCLUDED.fts_config,
          extraction_confidence = EXCLUDED.extraction_confidence,
          ocr_low_confidence = EXCLUDED.ocr_low_confidence,
          content_truncated = EXCLUDED.content_truncated,
          source_text_hash = EXCLUDED.source_text_hash,
          indexed_at = EXCLUDED.indexed_at,
          updated_at = EXCLUDED.updated_at
        RETURNING index_id, tenant_id, document_id, version_id, matter_id, client_id,
          author_user_id, ai_allowed, document_type, document_status, version_status,
          prev_version_id, next_version_id, title, content_text,
          content_truncated, extraction_confidence, ocr_low_confidence, source_text_hash,
          indexed_at, updated_at
      `,
      [
        source.tenant_id,
        source.document_id,
        source.version_id,
        source.matter_id,
        source.client_id,
        source.document_type,
        source.document_status,
        source.version_status,
        source.author_user_id,
        source.ai_allowed,
        source.prev_version_id,
        source.next_version_id,
        source.title,
        truncatedContent,
        extractionConfidence,
        ocrLowConfidence,
        contentTruncated,
        sourceTextHash,
        source.document_updated_at,
      ],
    );
    const row = result.rows[0] as SearchIndexDbRow | undefined;
    await this.upsertChunksAndEmbeddings(client, {
      tenantId: source.tenant_id,
      documentId: source.document_id,
      versionId: source.version_id,
      contentText,
      sourceTextHash,
    });
    return row ? mapRow(row) : null;
  }

  async findByVersion(
    client: QueryClient,
    input: { tenantId: string; versionId: string },
  ): Promise<SearchIndexRow | null> {
    const result = await client.query(
      `
        SELECT index_id, tenant_id, document_id, version_id, matter_id, client_id,
          author_user_id, ai_allowed, document_type, document_status, version_status,
          prev_version_id, next_version_id, title, content_text,
          content_truncated, extraction_confidence, ocr_low_confidence, source_text_hash,
          indexed_at, updated_at
        FROM document_search_index
        WHERE tenant_id = $1
          AND version_id = $2
        LIMIT 1
      `,
      [input.tenantId, input.versionId],
    );
    const row = result.rows[0] as SearchIndexDbRow | undefined;
    return row ? mapRow(row) : null;
  }

  private async findSource(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string },
  ): Promise<SearchIndexSourceRow | null> {
    const result = await client.query(
      `
        SELECT dv.tenant_id, dv.document_id, dv.version_id, d.matter_id, m.client_id,
          dv.created_by AS author_user_id, d.ai_allowed, dv.supersedes_version_id AS prev_version_id,
          (
            SELECT next_dv.version_id
            FROM document_versions next_dv
            WHERE next_dv.tenant_id = dv.tenant_id
              AND next_dv.document_id = dv.document_id
              AND next_dv.supersedes_version_id = dv.version_id
            ORDER BY next_dv.version_no ASC, next_dv.created_at ASC, next_dv.version_id ASC
            LIMIT 1
          ) AS next_version_id,
          d.document_type, d.status AS document_status, dv.version_status, d.title,
          cd.body_text, cd.extraction_method, cd.confidence AS extraction_confidence,
          d.updated_at AS document_updated_at
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        LEFT JOIN canonical_documents cd
          ON cd.tenant_id = dv.tenant_id
          AND cd.version_id = dv.version_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
          AND ${promotedDocumentExistsSql('d', 'dv')}
        LIMIT 1
      `,
      [input.tenantId, input.documentId, input.versionId],
    );
    return (result.rows[0] as SearchIndexSourceRow | undefined) ?? null;
  }

  private async upsertChunksAndEmbeddings(
    client: QueryClient,
    input: {
      tenantId: string;
      documentId: string;
      versionId: string;
      contentText: string;
      sourceTextHash: string;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE document_chunk_embeddings
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
      `,
      [input.tenantId, input.versionId],
    );
    await client.query(
      `
        UPDATE document_chunks
        SET stale = true, updated_at = now()
        WHERE tenant_id = $1
          AND version_id = $2
      `,
      [input.tenantId, input.versionId],
    );

    const chunks = buildParentChildChunks({
      text: input.contentText,
      sourceTextHash: input.sourceTextHash,
    });
    const parentChunkIds = new Map<number, string>();

    for (const chunk of chunks.filter((candidate) => candidate.chunkKind === 'parent')) {
      const chunkId = await this.upsertChunk(client, input, chunk, null);
      parentChunkIds.set(chunk.chunkOrdinal, chunkId);
    }

    for (const chunk of chunks.filter((candidate) => candidate.chunkKind === 'child')) {
      const parentChunkId =
        chunk.parentOrdinal === null ? undefined : parentChunkIds.get(chunk.parentOrdinal);
      if (!parentChunkId) throw new Error('child chunk missing parent provenance');
      const chunkId = await this.upsertChunk(client, input, chunk, parentChunkId);
      await this.upsertEmbedding(client, input, chunk, chunkId);
    }
    await this.deleteObsoleteEmbeddingRows(client, input);
  }

  private async upsertChunk(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string },
    chunk: BuiltDocumentChunk,
    parentChunkId: string | null,
  ): Promise<string> {
    const result = await client.query(
      `
        INSERT INTO document_chunks (
          tenant_id, document_id, version_id, parent_chunk_id, chunk_kind, chunk_ordinal,
          char_start, char_end, token_count, chunk_text, text_hash, source_text_hash,
          stale, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, now())
        ON CONFLICT (tenant_id, version_id, chunk_ordinal)
        DO UPDATE SET
          document_id = EXCLUDED.document_id,
          parent_chunk_id = EXCLUDED.parent_chunk_id,
          chunk_kind = EXCLUDED.chunk_kind,
          char_start = EXCLUDED.char_start,
          char_end = EXCLUDED.char_end,
          token_count = EXCLUDED.token_count,
          chunk_text = EXCLUDED.chunk_text,
          text_hash = EXCLUDED.text_hash,
          source_text_hash = EXCLUDED.source_text_hash,
          stale = false,
          updated_at = EXCLUDED.updated_at
        RETURNING chunk_id
      `,
      [
        input.tenantId,
        input.documentId,
        input.versionId,
        parentChunkId,
        chunk.chunkKind,
        chunk.chunkOrdinal,
        chunk.charStart,
        chunk.charEnd,
        chunk.tokenCount,
        chunk.chunkText,
        chunk.textHash,
        chunk.sourceTextHash,
      ],
    );
    const row = result.rows[0] as ChunkDbRow | undefined;
    if (!row) throw new Error('chunk upsert returned no row');
    return row.chunk_id;
  }

  private async upsertEmbedding(
    client: QueryClient,
    input: { tenantId: string; documentId: string; versionId: string; sourceTextHash: string },
    chunk: BuiltDocumentChunk,
    chunkId: string,
  ): Promise<void> {
    const embeddingResult = await this.embeddingGateway.embedText({ text: chunk.chunkText });
    const vector =
      embeddingResult.status === 'completed' && embeddingResult.embedding
        ? embeddingResult.embedding
        : zeroEmbeddingVector();
    const stale = embeddingResult.status !== 'completed';
    await client.query(
      `
        INSERT INTO document_chunk_embeddings (
          tenant_id, chunk_id, document_id, version_id, model_route, model_tier,
          embedding, embedding_hash, source_text_hash, stale, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'local', $6::vector, $7, $8, $9, now())
        ON CONFLICT (tenant_id, chunk_id, model_route)
        DO UPDATE SET
          document_id = EXCLUDED.document_id,
          version_id = EXCLUDED.version_id,
          model_tier = EXCLUDED.model_tier,
          embedding = EXCLUDED.embedding,
          embedding_hash = EXCLUDED.embedding_hash,
          source_text_hash = EXCLUDED.source_text_hash,
          stale = EXCLUDED.stale,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.tenantId,
        chunkId,
        input.documentId,
        input.versionId,
        searchEmbeddingModelRoute,
        vectorToSqlLiteral(vector),
        embeddingHash(vector),
        input.sourceTextHash,
        stale,
      ],
    );
  }

  private async deleteObsoleteEmbeddingRows(
    client: QueryClient,
    input: { tenantId: string; versionId: string },
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM document_chunk_embeddings
        WHERE tenant_id = $1
          AND version_id = $2
          AND model_route <> $3
      `,
      [input.tenantId, input.versionId, searchEmbeddingModelRoute],
    );
  }
}

export function createDefaultSearchEmbeddingGateway(): SearchEmbeddingGateway {
  return new LocalEmbeddingGateway({
    enabled: process.env.LOCAL_EMBEDDING_ENABLED !== '0',
    endpoint:
      process.env.LOCAL_EMBEDDING_ENDPOINT ??
      process.env.OLLAMA_BASE_URL ??
      'http://127.0.0.1:11434',
    model: process.env.LOCAL_EMBEDDING_MODEL ?? localEmbeddingDefaultModel,
    timeoutMs: positiveIntEnv('LOCAL_EMBEDDING_TIMEOUT_MS', 30_000),
  });
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
