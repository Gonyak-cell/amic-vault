import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { evidencePackSchema, type EvidencePackDto } from '@amic-vault/shared';
import type { QueryClient } from '../../audit/audit.service';
import { SearchFilterBuilder } from '../../search/query/search-filter.builder';
import type { SearchSqlFragment } from '../../search/query/search-filter.builder';
import type { AiRetrievedChunk } from '../retrieval/ai-retrieval.types';
import type { AiPrepArtifactKind, AiPrepArtifactPayloadDto } from '@amic-vault/shared';
import type { AiPrepJobPayload, AiPrepSource, AiPrepSourceChunk } from './ai-prep.types';

interface TargetRow {
  tenant_id: string;
  document_id: string;
  version_id: string;
  matter_id: string;
  created_by: string;
  title: string;
}

interface ChunkRow extends TargetRow {
  chunk_id: string;
  parent_chunk_id: string | null;
  chunk_ordinal: number;
  token_count: number;
  chunk_text: string;
  text_hash: string;
  source_text_hash: string;
}

interface ArtifactRow {
  ai_prep_artifact_id: string;
  artifact_kind: AiPrepArtifactKind;
}

@Injectable()
export class AiPrepRepository {
  constructor(@Inject(SearchFilterBuilder) private readonly filterBuilder: SearchFilterBuilder) {}

  async findTarget(client: QueryClient, payload: AiPrepJobPayload): Promise<AiPrepSource | null> {
    const result = await client.query(
      `
        SELECT dv.tenant_id, dv.document_id, dv.version_id, d.matter_id, dv.created_by, d.title
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        WHERE dv.tenant_id = $1
          AND dv.document_id = $2
          AND dv.version_id = $3
          AND dv.version_status = 'current'
        LIMIT 1
      `,
      [payload.tenantId, payload.documentId, payload.versionId],
    );
    const row = result.rows[0] as TargetRow | undefined;
    return row
      ? {
          tenantId: row.tenant_id,
          documentId: row.document_id,
          versionId: row.version_id,
          matterId: row.matter_id,
          actorId: row.created_by,
          title: row.title,
          chunks: [],
        }
      : null;
  }

  async findScopedSource(
    client: QueryClient,
    payload: AiPrepJobPayload,
    scope: SearchSqlFragment,
  ): Promise<AiPrepSource | null> {
    const filters = this.filterBuilder.build({
      filters: { matterId: payload.matterId ?? undefined, versionStatus: 'current' },
      scope,
    });
    const params = [...filters.params, payload.tenantId, payload.documentId, payload.versionId];
    const result = await client.query(
      `
        SELECT idx.tenant_id, idx.document_id, idx.version_id, idx.matter_id,
          dv.created_by, idx.title, chunk.chunk_id, chunk.parent_chunk_id,
          chunk.chunk_ordinal, chunk.token_count, chunk.chunk_text,
          chunk.text_hash, chunk.source_text_hash
        FROM document_search_index idx
        JOIN documents ai_doc
          ON ai_doc.tenant_id = idx.tenant_id
          AND ai_doc.document_id = idx.document_id
          AND ai_doc.ai_allowed = true
        JOIN document_versions dv
          ON dv.tenant_id = idx.tenant_id
          AND dv.version_id = idx.version_id
          AND dv.document_id = idx.document_id
          AND dv.version_status = 'current'
        JOIN document_chunks chunk
          ON chunk.tenant_id = idx.tenant_id
          AND chunk.version_id = idx.version_id
          AND chunk.chunk_kind = 'child'
          AND chunk.stale = false
        ${filters.whereSql}
          AND idx.tenant_id = $${filters.params.length + 1}
          AND idx.document_id = $${filters.params.length + 2}
          AND idx.version_id = $${filters.params.length + 3}
        ORDER BY chunk.chunk_ordinal ASC
        LIMIT 12
      `,
      params,
    );
    const rows = result.rows as ChunkRow[];
    const first = rows[0];
    if (!first) return null;
    return {
      tenantId: first.tenant_id,
      documentId: first.document_id,
      versionId: first.version_id,
      matterId: first.matter_id,
      actorId: first.created_by,
      title: first.title,
      chunks: rows.map((row, index) => ({
        documentId: row.document_id,
        versionId: row.version_id,
        matterId: row.matter_id,
        chunkId: row.chunk_id,
        parentChunkId: row.parent_chunk_id,
        chunkOrdinal: row.chunk_ordinal,
        tokenCount: row.token_count,
        score: Math.max(0.01, 1 - index * 0.01),
        chunkText: row.chunk_text,
        textHash: row.text_hash,
        sourceTextHash: row.source_text_hash,
      })),
    };
  }

  buildEvidencePack(input: {
    source: AiPrepSource;
    chunks: readonly AiRetrievedChunk[];
    artifactKind: AiPrepArtifactKind;
    appliedRules: readonly string[];
  }): EvidencePackDto {
    const tokenBudget = 2400;
    const tokenCount = Math.min(
      tokenBudget,
      input.chunks.reduce((total, chunk) => total + chunk.tokenCount, 0),
    );
    const sourceRefs = input.chunks.map((chunk) => `chunk:${chunk.chunkId}`);
    return evidencePackSchema.parse({
      packId: randomUUID(),
      userQuestion: questionForArtifactKind(input.artifactKind, input.source.title),
      rewrittenQueries: [queryForArtifactKind(input.artifactKind, input.source.title)],
      taskType: taskTypeForArtifactKind(input.artifactKind),
      matterContext: { matterId: input.source.matterId },
      retrievalScope: {
        tenantId: input.source.tenantId,
        matterId: input.source.matterId,
        mode: 'hybrid',
        modelRoute: 'local_gemma',
        appliedRules: [...input.appliedRules],
      },
      relevantDocuments: [
        {
          documentId: input.source.documentId,
          versionIds: [input.source.versionId],
          chunkCount: input.chunks.length,
          sourceTextHashes: [...new Set(input.chunks.map((chunk) => chunk.sourceTextHash))].slice(
            0,
            20,
          ),
        },
      ],
      authoritativeSources: [],
      retrievedChunks: input.chunks.map((chunk) => ({
        citationRef: `chunk:${chunk.chunkId}`,
        documentId: chunk.documentId,
        versionId: chunk.versionId,
        matterId: chunk.matterId,
        chunkId: chunk.chunkId,
        parentChunkId: chunk.parentChunkId,
        chunkOrdinal: chunk.chunkOrdinal,
        tokenCount: chunk.tokenCount,
        score: chunk.score,
        redactedText: chunk.redactedText,
        textHash: chunk.textHash,
        sourceTextHash: chunk.sourceTextHash,
      })),
      omittedChunkIds: [],
      window: { tokenBudget, tokenCount },
      graphFacts: [],
      ruleFindings: [],
      conflicts: [],
      uncertainty: [],
      prohibitedAssumptions: [
        'Do not use facts outside retrieved chunks.',
        'Do not provide legal conclusions or advice.',
        'Treat this as post-upload preparation only; user-facing answers must re-check permissions.',
      ],
      citationRequirements: {
        required: true,
        style: 'chunk_ref',
        sourceRefs,
      },
      outputFormat: { kind: taskTypeForArtifactKind(input.artifactKind), locale: 'ko-KR' },
      escalationFlags: [],
    });
  }

  async markSupersededArtifactsStale(
    client: QueryClient,
    input: { tenantId: string; documentId: string; currentVersionId: string },
  ): Promise<ArtifactRow[]> {
    const result = await client.query(
      `
        UPDATE ai_prep_artifacts
        SET is_stale = true,
          status = CASE WHEN status = 'pending' THEN 'stale' ELSE status END,
          stale_reason = 'new_version',
          stale_at = now(),
          updated_at = now()
        WHERE tenant_id = $1
          AND document_id = $2
          AND document_version_id <> $3
          AND is_stale = false
        RETURNING ai_prep_artifact_id, artifact_kind
      `,
      [input.tenantId, input.documentId, input.currentVersionId],
    );
    return result.rows as ArtifactRow[];
  }

  async upsertBlocked(
    client: QueryClient,
    input: {
      source: AiPrepSource;
      artifactKind: AiPrepArtifactKind;
      reasonCode: string;
      sourceChunks?: readonly AiPrepSourceChunk[] | undefined;
    },
  ): Promise<string> {
    const result = await this.upsertArtifact(client, {
      source: input.source,
      artifactKind: input.artifactKind,
      status: 'blocked',
      sourceChunks: input.sourceChunks ?? input.source.chunks,
      failureReasonCode: input.reasonCode,
    });
    return result.ai_prep_artifact_id;
  }

  async upsertFailed(
    client: QueryClient,
    input: {
      source: AiPrepSource;
      artifactKind: AiPrepArtifactKind;
      reasonCode: string;
      sourceChunks?: readonly AiPrepSourceChunk[] | undefined;
    },
  ): Promise<string> {
    const result = await this.upsertArtifact(client, {
      source: input.source,
      artifactKind: input.artifactKind,
      status: 'failed',
      sourceChunks: input.sourceChunks ?? input.source.chunks,
      failureReasonCode: input.reasonCode,
    });
    return result.ai_prep_artifact_id;
  }

  async upsertRejected(
    client: QueryClient,
    input: {
      source: AiPrepSource;
      artifactKind: AiPrepArtifactKind;
      sourceChunks: readonly AiPrepSourceChunk[];
      reasonCode: string;
      promptHash: string;
      responseHash: string;
      payload: AiPrepArtifactPayloadDto;
      modelName?: string | undefined;
      latencyMs?: number | undefined;
    },
  ): Promise<string> {
    const result = await this.upsertArtifact(client, {
      source: input.source,
      artifactKind: input.artifactKind,
      status: 'rejected',
      sourceChunks: input.sourceChunks,
      failureReasonCode: input.reasonCode,
      promptHash: input.promptHash,
      responseHash: input.responseHash,
      payload: input.payload,
      modelName: input.modelName,
      latencyMs: input.latencyMs,
    });
    return result.ai_prep_artifact_id;
  }

  async upsertCompleted(
    client: QueryClient,
    input: {
      source: AiPrepSource;
      artifactKind: AiPrepArtifactKind;
      sourceChunks: readonly AiPrepSourceChunk[];
      promptHash: string;
      responseHash: string;
      payload: AiPrepArtifactPayloadDto;
      modelName?: string | undefined;
      latencyMs?: number | undefined;
    },
  ): Promise<string> {
    const result = await this.upsertArtifact(client, {
      source: input.source,
      artifactKind: input.artifactKind,
      status: 'completed',
      sourceChunks: input.sourceChunks,
      promptHash: input.promptHash,
      responseHash: input.responseHash,
      payload: input.payload,
      modelName: input.modelName,
      latencyMs: input.latencyMs,
    });
    return result.ai_prep_artifact_id;
  }

  private async upsertArtifact(
    client: QueryClient,
    input: {
      source: AiPrepSource;
      artifactKind: AiPrepArtifactKind;
      status: 'completed' | 'blocked' | 'failed' | 'rejected';
      sourceChunks: readonly AiPrepSourceChunk[];
      failureReasonCode?: string | undefined;
      promptHash?: string | undefined;
      responseHash?: string | undefined;
      payload?: AiPrepArtifactPayloadDto | undefined;
      modelName?: string | undefined;
      latencyMs?: number | undefined;
    },
  ): Promise<{ ai_prep_artifact_id: string }> {
    const payload = input.payload ?? {};
    const result = await client.query(
      `
        INSERT INTO ai_prep_artifacts (
          tenant_id, matter_id, document_id, document_version_id, artifact_kind,
          status, model_route, model_name, source_chunk_ids, source_hashes,
          prompt_hash, response_hash, payload_json, latency_ms, is_stale,
          stale_reason, failure_reason_code, updated_at, generated_at, stale_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, 'local_gemma', $7, $8::uuid[],
          $9::jsonb, $10, $11, $12::jsonb, $13, false, null, $14, now(),
          CASE WHEN $6 = 'completed' THEN now() ELSE null END,
          null
        )
        ON CONFLICT (tenant_id, document_version_id, artifact_kind)
        DO UPDATE SET
          status = EXCLUDED.status,
          model_name = EXCLUDED.model_name,
          source_chunk_ids = EXCLUDED.source_chunk_ids,
          source_hashes = EXCLUDED.source_hashes,
          prompt_hash = EXCLUDED.prompt_hash,
          response_hash = EXCLUDED.response_hash,
          payload_json = EXCLUDED.payload_json,
          latency_ms = EXCLUDED.latency_ms,
          is_stale = false,
          stale_reason = null,
          failure_reason_code = EXCLUDED.failure_reason_code,
          updated_at = now(),
          generated_at = EXCLUDED.generated_at,
          stale_at = null
        RETURNING ai_prep_artifact_id
      `,
      [
        input.source.tenantId,
        input.source.matterId,
        input.source.documentId,
        input.source.versionId,
        input.artifactKind,
        input.status,
        input.modelName ?? null,
        input.sourceChunks.map((chunk) => chunk.chunkId),
        JSON.stringify([...new Set(input.sourceChunks.map((chunk) => chunk.sourceTextHash))]),
        input.promptHash ?? null,
        input.responseHash ?? null,
        JSON.stringify(payload),
        input.latencyMs ?? null,
        input.failureReasonCode ?? null,
      ],
    );
    const row = result.rows[0] as { ai_prep_artifact_id?: string } | undefined;
    if (!row?.ai_prep_artifact_id) throw new Error('ai prep artifact upsert returned no id');
    return { ai_prep_artifact_id: row.ai_prep_artifact_id };
  }
}

function questionForArtifactKind(kind: AiPrepArtifactKind, title: string): string {
  const label = title.trim() || 'uploaded document';
  switch (kind) {
    case 'document_profile':
      return `Summarize what kind of file ${label} is and what it contains. Do not analyze legal issues.`;
    case 'key_fields':
      return `Extract basic file fields from ${label}: dates, amounts, identifiers, parties, senders, recipients, and reference numbers.`;
    case 'date_facts':
      return `List dated facts found in ${label} without interpreting legal significance.`;
    case 'people_organizations':
      return `List people and organizations mentioned in ${label} with their document-stated roles only.`;
    case 'keyword_tags':
      return `Create search keywords and tags for finding ${label} later.`;
    case 'filing_suggestions':
      return `Suggest filing categories or matter-folder placement for ${label} based only on document metadata and wording.`;
    case 'source_outline':
      return `Create a section and heading outline for ${label}.`;
    case 'retrieval_hints':
      return `Create neutral search hints for retrieving ${label} later.`;
  }
}

function queryForArtifactKind(kind: AiPrepArtifactKind, title: string): string {
  return `${kind}:${title.trim() || 'document'}`;
}

function taskTypeForArtifactKind(kind: AiPrepArtifactKind): EvidencePackDto['taskType'] {
  void kind;
  return 'summary';
}
