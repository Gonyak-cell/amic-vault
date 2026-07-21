import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SearchAdminHealthDto } from '@amic-vault/shared';
import { pgBossSchema } from '../../../common/db/pg-boss-runtime-options';
import { AuditService } from '../../audit/audit.service';
import { TenantContextService } from '../../tenant/tenant-context';
import {
  searchIndexDeadLetterQueueName,
  searchIndexQueueName,
  SearchIndexingService,
} from './indexing.service';
import { searchEmbeddingModelRoute } from './search-index.repository';

type ReindexScopeType = 'tenant' | 'matter';
const embeddingBackfillDefaultBatchSize = 100;
const embeddingBackfillMaxBatchSize = 500;
const postgresIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export interface ReindexRequestInput {
  scopeType: ReindexScopeType;
  scopeId?: string | null;
}

export interface ReindexRequestResult {
  accepted: true;
  scopeType: ReindexScopeType;
  scopeId: string;
  enqueuedJobCount: number;
}

export interface EmbeddingBackfillRequestInput extends ReindexRequestInput {
  batchSize?: number | null;
}

export interface EmbeddingBackfillRequestResult {
  accepted: true;
  scopeType: ReindexScopeType;
  scopeId: string;
  batchSize: number;
  candidateVersionCount: number;
  enqueuedJobCount: number;
}

export interface EmbeddingBackfillProgressResult {
  pendingVersionCount: number;
  missingEmbeddingCount: number;
  staleChunkCount: number;
  staleEmbeddingCount: number;
  legacyEmbeddingCount: number;
  queueDepth: number;
  deadLetterJobCount: number;
}

interface SearchHealthIndexRow {
  current_version_count: number | string;
  indexed_version_count: number | string;
  missing_index_count: number | string;
  stale_index_count: number | string;
  extraction_ready_count: number | string;
  extraction_pending_count: number | string;
  ocr_pending_count: number | string;
  ocr_low_confidence_count: number | string;
  extraction_failed_count: number | string;
}

interface SearchHealthChunkRow {
  stale_chunk_count: number | string;
  stale_embedding_count: number | string;
}

interface SearchHealthAuditRow {
  query_audit_count_24h: number | string;
  no_result_query_count_24h: number | string;
  p95_duration_ms_24h: number | string | null;
}

interface NoResultQueryRow {
  category: string;
  count: number | string;
  last_seen_at: Date;
  query_hash: string;
}

interface EmbeddingBackfillCandidateRow {
  document_id: string;
  version_id: string;
}

interface EmbeddingBackfillProgressRow {
  pending_version_count: number | string;
  missing_embedding_count: number | string;
  stale_chunk_count: number | string;
  stale_embedding_count: number | string;
  legacy_embedding_count: number | string;
}

interface EmbeddingBackfillQueueRow {
  queue_depth: number | string;
  dead_letter_count: number | string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

@Injectable()
export class ReindexService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchIndexingService) private readonly indexingService: SearchIndexingService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async requestReindex(
    actorUserId: string,
    input: ReindexRequestInput,
  ): Promise<ReindexRequestResult> {
    const context = this.tenantContext.require();
    const scope = this.normalizeScope(context.tenantId, input);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      if (scope.scopeType === 'matter') {
        const exists = await tx.query(
          `
            SELECT matter_id
            FROM matters
            WHERE tenant_id = $1
              AND matter_id = $2
            LIMIT 1
          `,
          [context.tenantId, scope.scopeId],
        );
        if (exists.rowCount !== 1) throw validationFailed('REINDEX_SCOPE_NOT_FOUND');
      }
      const jobIds = await this.indexingService.enqueueTenantOrMatterVersions(
        {
          tenantId: context.tenantId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
        },
        tx,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'SEARCH_REINDEX_REQUESTED',
          targetType: 'search_index',
          targetId: scope.scopeId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
          metadata: {
            scope_type: scope.scopeType,
            scope_id: scope.scopeId,
            enqueued_job_count: jobIds.length,
          },
        },
        tx,
      );
      return {
        accepted: true,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        enqueuedJobCount: jobIds.length,
      };
    });
  }

  async requestEmbeddingBackfill(
    actorUserId: string,
    input: EmbeddingBackfillRequestInput,
  ): Promise<EmbeddingBackfillRequestResult> {
    const context = this.tenantContext.require();
    const scope = this.normalizeScope(context.tenantId, input);
    const batchSize = normalizeEmbeddingBackfillBatchSize(input.batchSize);
    return this.auditService.transaction(context.tenantId, async (tx) => {
      await this.assertScopeExists(tx, context.tenantId, scope);
      const candidates = await this.findEmbeddingBackfillCandidates(
        tx,
        context.tenantId,
        scope.scopeType === 'matter' ? scope.scopeId : null,
        batchSize,
      );
      const jobIds: string[] = [];
      for (const row of candidates) {
        jobIds.push(
          await this.indexingService.enqueueVersion(
            {
              tenantId: context.tenantId,
              documentId: row.document_id,
              versionId: row.version_id,
            },
            tx,
          ),
        );
      }
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'SEARCH_REINDEX_REQUESTED',
          targetType: 'search_index',
          targetId: scope.scopeId,
          matterId: scope.scopeType === 'matter' ? scope.scopeId : null,
          metadata: {
            scope_type:
              scope.scopeType === 'matter'
                ? 'embedding_backfill_matter'
                : 'embedding_backfill_tenant',
            scope_id: scope.scopeId,
            batch_size: batchSize,
            candidate_version_count: candidates.length,
            enqueued_job_count: jobIds.length,
            queue_name: searchIndexQueueName,
            dead_letter_queue: searchIndexDeadLetterQueueName,
          },
        },
        tx,
      );
      return {
        accepted: true,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        batchSize,
        candidateVersionCount: candidates.length,
        enqueuedJobCount: jobIds.length,
      };
    });
  }

  async getEmbeddingBackfillProgress(): Promise<EmbeddingBackfillProgressResult> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const progressResult = await client.query<EmbeddingBackfillProgressRow>(
        `
          WITH current_child_chunks AS (
            SELECT chunk.tenant_id, chunk.chunk_id, chunk.document_id, chunk.version_id, chunk.stale
            FROM document_chunks chunk
            JOIN document_versions dv
              ON dv.tenant_id = chunk.tenant_id
              AND dv.version_id = chunk.version_id
            JOIN documents d
              ON d.tenant_id = dv.tenant_id
              AND d.document_id = dv.document_id
            WHERE chunk.tenant_id = $1
              AND chunk.chunk_kind = 'child'
              AND dv.version_status = 'current'
              AND d.status <> 'deleted'
          ),
          chunk_embedding_state AS (
            SELECT chunk.version_id, chunk.chunk_id, chunk.stale AS chunk_stale,
              bool_or(embedding.model_route = $2 AND embedding.stale = false) AS has_fresh_target,
              bool_or(embedding.model_route = $2 AND embedding.stale = true) AS has_stale_target,
              count(*) FILTER (WHERE embedding.model_route <> $2)::int AS legacy_count
            FROM current_child_chunks chunk
            LEFT JOIN document_chunk_embeddings embedding
              ON embedding.tenant_id = chunk.tenant_id
              AND embedding.chunk_id = chunk.chunk_id
            GROUP BY chunk.version_id, chunk.chunk_id, chunk.stale
          )
          SELECT
            count(DISTINCT version_id) FILTER (
              WHERE chunk_stale = true
                OR has_fresh_target IS NOT TRUE
                OR has_stale_target IS TRUE
                OR legacy_count > 0
            )::int AS pending_version_count,
            count(*) FILTER (WHERE has_fresh_target IS NOT TRUE)::int AS missing_embedding_count,
            count(*) FILTER (WHERE chunk_stale = true)::int AS stale_chunk_count,
            count(*) FILTER (WHERE has_stale_target IS TRUE)::int AS stale_embedding_count,
            coalesce(sum(legacy_count), 0)::int AS legacy_embedding_count
          FROM chunk_embedding_state
        `,
        [context.tenantId, searchEmbeddingModelRoute],
      );
      const queueResult = await client.query<EmbeddingBackfillQueueRow>(
        `
          SELECT
            count(*) FILTER (
              WHERE name = $1
                AND state IN ('created', 'retry', 'active')
            )::int AS queue_depth,
            count(*) FILTER (
              WHERE name = $2
                AND state IN ('created', 'retry', 'active', 'failed')
            )::int AS dead_letter_count
          FROM ${pgBossJobTableSql()}
          WHERE name IN ($1, $2)
        `,
        [searchIndexQueueName, searchIndexDeadLetterQueueName],
      );
      const progressRow = progressResult.rows[0];
      const queueRow = queueResult.rows[0];
      return {
        pendingVersionCount: toInt(progressRow?.pending_version_count),
        missingEmbeddingCount: toInt(progressRow?.missing_embedding_count),
        staleChunkCount: toInt(progressRow?.stale_chunk_count),
        staleEmbeddingCount: toInt(progressRow?.stale_embedding_count),
        legacyEmbeddingCount: toInt(progressRow?.legacy_embedding_count),
        queueDepth: toInt(queueRow?.queue_depth),
        deadLetterJobCount: toInt(queueRow?.dead_letter_count),
      };
    });
  }

  async getSearchHealth(): Promise<SearchAdminHealthDto> {
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (client) => {
      const indexResult = await client.query(
        `
            WITH current_versions AS (
              SELECT dv.tenant_id, dv.document_id, dv.version_id, d.updated_at AS document_updated_at,
                dv.created_at AS version_created_at
              FROM document_versions dv
              JOIN documents d
                ON d.tenant_id = dv.tenant_id
                AND d.document_id = dv.document_id
              WHERE dv.tenant_id = $1
                AND dv.version_status = 'current'
                AND d.status <> 'deleted'
            )
            SELECT
              count(*)::int AS current_version_count,
              count(idx.version_id)::int AS indexed_version_count,
              count(*) FILTER (WHERE idx.version_id IS NULL)::int AS missing_index_count,
              count(*) FILTER (
                WHERE idx.version_id IS NOT NULL
                  AND idx.indexed_at < greatest(
                    cv.document_updated_at,
                    cv.version_created_at,
                    coalesce(cd.updated_at, cv.document_updated_at)
                  )
              )::int AS stale_index_count,
              count(*) FILTER (WHERE coalesce(cd.extraction_status, 'pending') = 'ready')::int
                AS extraction_ready_count,
              count(*) FILTER (WHERE coalesce(cd.extraction_status, 'pending') = 'pending')::int
                AS extraction_pending_count,
              count(*) FILTER (WHERE coalesce(cd.extraction_status, 'pending') = 'ocr_pending')::int
                AS ocr_pending_count,
              count(*) FILTER (
                WHERE cd.extraction_method = 'ocr'
                  AND cd.confidence IS NOT NULL
                  AND cd.confidence < 0.8
              )::int AS ocr_low_confidence_count,
              count(*) FILTER (WHERE coalesce(cd.extraction_status, 'pending') = 'failed')::int
                AS extraction_failed_count
            FROM current_versions cv
            LEFT JOIN document_search_index idx
              ON idx.tenant_id = cv.tenant_id
              AND idx.version_id = cv.version_id
            LEFT JOIN canonical_documents cd
              ON cd.tenant_id = cv.tenant_id
              AND cd.version_id = cv.version_id
          `,
        [context.tenantId],
      );
      const chunkResult = await client.query(
        `
            SELECT
              (
                SELECT count(*)::int
                FROM document_chunks chunk
                JOIN document_versions dv
                  ON dv.tenant_id = chunk.tenant_id
                  AND dv.version_id = chunk.version_id
                WHERE chunk.tenant_id = $1
                  AND dv.version_status = 'current'
                  AND chunk.stale = true
              ) AS stale_chunk_count,
              (
                SELECT count(*)::int
                FROM document_chunk_embeddings embedding
                JOIN document_versions dv
                  ON dv.tenant_id = embedding.tenant_id
                  AND dv.version_id = embedding.version_id
                WHERE embedding.tenant_id = $1
                  AND dv.version_status = 'current'
                  AND embedding.stale = true
              ) AS stale_embedding_count
          `,
        [context.tenantId],
      );
      const auditResult = await client.query(
        `
            WITH search_audits AS (
              SELECT
                CASE
                  WHEN metadata_json->>'duration_ms' ~ '^[0-9]+$'
                  THEN (metadata_json->>'duration_ms')::int
                  ELSE NULL
                END AS duration_ms,
                CASE
                  WHEN metadata_json->>'result_count' ~ '^[0-9]+$'
                  THEN (metadata_json->>'result_count')::int
                  ELSE NULL
                END AS result_count
              FROM audit_events
              WHERE tenant_id = $1
                AND action = 'SEARCH_EXECUTED'
                AND created_at >= now() - interval '24 hours'
            )
            SELECT
              count(*)::int AS query_audit_count_24h,
              count(*) FILTER (WHERE result_count = 0)::int AS no_result_query_count_24h,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95_duration_ms_24h
            FROM search_audits
          `,
        [context.tenantId],
      );
      const noResultQueriesResult = await client.query(
        `
            SELECT
              substring(coalesce(nullif(metadata_json->>'scope_type', ''), 'keyword') from 1 for 40)
                AS category,
              count(*)::int AS count,
              max(created_at) AS last_seen_at,
              metadata_json->>'query_hash' AS query_hash
            FROM audit_events
            WHERE tenant_id = $1
              AND action = 'SEARCH_EXECUTED'
              AND created_at >= now() - interval '24 hours'
              AND metadata_json->>'query_hash' ~ '^[a-f0-9]{64}$'
              AND metadata_json->>'result_count' = '0'
            GROUP BY category, query_hash
            ORDER BY count DESC, last_seen_at DESC
            LIMIT 5
          `,
        [context.tenantId],
      );
      const indexRow = indexResult.rows[0] as SearchHealthIndexRow | undefined;
      const chunkRow = chunkResult.rows[0] as SearchHealthChunkRow | undefined;
      const auditRow = auditResult.rows[0] as SearchHealthAuditRow | undefined;
      const noResultRows = noResultQueriesResult.rows as NoResultQueryRow[];

      return {
        currentVersionCount: toInt(indexRow?.current_version_count),
        indexedVersionCount: toInt(indexRow?.indexed_version_count),
        missingIndexCount: toInt(indexRow?.missing_index_count),
        staleIndexCount: toInt(indexRow?.stale_index_count),
        extractionReadyCount: toInt(indexRow?.extraction_ready_count),
        extractionPendingCount: toInt(indexRow?.extraction_pending_count),
        ocrPendingCount: toInt(indexRow?.ocr_pending_count),
        ocrLowConfidenceCount: toInt(indexRow?.ocr_low_confidence_count),
        extractionFailedCount: toInt(indexRow?.extraction_failed_count),
        staleChunkCount: toInt(chunkRow?.stale_chunk_count),
        staleEmbeddingCount: toInt(chunkRow?.stale_embedding_count),
        queryAuditCount24h: toInt(auditRow?.query_audit_count_24h),
        noResultQueryCount24h: toInt(auditRow?.no_result_query_count_24h),
        p95DurationMs24h: toNullableInt(auditRow?.p95_duration_ms_24h),
        noResultQueries: noResultRows.map((row) => ({
          category: row.category,
          count: toInt(row.count),
          lastSeenAt: row.last_seen_at.toISOString(),
          queryHash: row.query_hash.toLowerCase(),
        })),
      };
    });
  }

  private normalizeScope(
    tenantId: string,
    input: ReindexRequestInput,
  ): ReindexRequestInput & { scopeId: string } {
    if (input.scopeType === 'tenant') return { scopeType: 'tenant', scopeId: tenantId };
    if (input.scopeType === 'matter' && input.scopeId) {
      return { scopeType: 'matter', scopeId: input.scopeId };
    }
    throw validationFailed('REINDEX_SCOPE_INVALID');
  }

  private async assertScopeExists(
    tx: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> },
    tenantId: string,
    scope: ReindexRequestInput & { scopeId: string },
  ): Promise<void> {
    if (scope.scopeType !== 'matter') return;
    const exists = await tx.query(
      `
        SELECT matter_id
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, scope.scopeId],
    );
    if (exists.rowCount !== 1) throw validationFailed('REINDEX_SCOPE_NOT_FOUND');
  }

  private async findEmbeddingBackfillCandidates(
    tx: {
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{ rows: EmbeddingBackfillCandidateRow[] }>;
    },
    tenantId: string,
    matterId: string | null,
    batchSize: number,
  ): Promise<EmbeddingBackfillCandidateRow[]> {
    const params: unknown[] = [tenantId, searchEmbeddingModelRoute];
    const filters = [
      'chunk.tenant_id = $1',
      "chunk.chunk_kind = 'child'",
      "dv.version_status = 'current'",
      "d.status <> 'deleted'",
    ];
    if (matterId) {
      params.push(matterId);
      filters.push(`d.matter_id = $${params.length}`);
    }
    params.push(batchSize);
    const limitParam = `$${params.length}`;
    const result = await tx.query(
      `
        SELECT DISTINCT dv.document_id, dv.version_id
        FROM document_chunks chunk
        JOIN document_versions dv
          ON dv.tenant_id = chunk.tenant_id
          AND dv.version_id = chunk.version_id
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        WHERE ${filters.join(' AND ')}
          AND (
            chunk.stale = true
            OR EXISTS (
              SELECT 1
              FROM document_chunk_embeddings legacy
              WHERE legacy.tenant_id = chunk.tenant_id
                AND legacy.chunk_id = chunk.chunk_id
                AND legacy.model_route <> $2
            )
            OR NOT EXISTS (
              SELECT 1
              FROM document_chunk_embeddings target
              WHERE target.tenant_id = chunk.tenant_id
                AND target.chunk_id = chunk.chunk_id
                AND target.model_route = $2
                AND target.stale = false
            )
          )
        ORDER BY dv.version_id ASC
        LIMIT ${limitParam}
      `,
      params,
    );
    return result.rows;
  }
}

function toInt(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function toNullableInt(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toInt(value);
}

function normalizeEmbeddingBackfillBatchSize(value: number | null | undefined): number {
  if (value === null || value === undefined) return embeddingBackfillDefaultBatchSize;
  if (!Number.isInteger(value) || value < 1 || value > embeddingBackfillMaxBatchSize) {
    throw validationFailed('EMBEDDING_BACKFILL_BATCH_SIZE_INVALID');
  }
  return value;
}

function pgBossJobTableSql(): string {
  const schema = pgBossSchema() ?? 'pgboss';
  if (!postgresIdentifierPattern.test(schema)) return 'pgboss.job';
  return `${schema}.job`;
}
