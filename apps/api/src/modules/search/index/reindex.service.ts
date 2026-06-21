import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SearchAdminHealthDto } from '@amic-vault/shared';
import { AuditService } from '../../audit/audit.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { SearchIndexingService } from './indexing.service';

type ReindexScopeType = 'tenant' | 'matter';

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

interface SearchHealthIndexRow {
  current_version_count: number | string;
  indexed_version_count: number | string;
  missing_index_count: number | string;
  stale_index_count: number | string;
  extraction_ready_count: number | string;
  extraction_pending_count: number | string;
  ocr_pending_count: number | string;
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

  async requestReindex(actorUserId: string, input: ReindexRequestInput): Promise<ReindexRequestResult> {
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

  private normalizeScope(tenantId: string, input: ReindexRequestInput): ReindexRequestInput & { scopeId: string } {
    if (input.scopeType === 'tenant') return { scopeType: 'tenant', scopeId: tenantId };
    if (input.scopeType === 'matter' && input.scopeId) {
      return { scopeType: 'matter', scopeId: input.scopeId };
    }
    throw validationFailed('REINDEX_SCOPE_INVALID');
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
