import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  AuditMetadata,
  SearchFacetBucketDto,
  SearchFacetsDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchResultDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
  type SearchRequestContext,
} from './permission/search-permission-scope.provider';
import { SearchQueryBuilder } from './query/search-query.builder';
import { SnippetBuilder } from './query/snippet-builder';

interface SearchDbRow {
  document_id: string;
  version_id: string;
  matter_id: string;
  client_id: string;
  title: string;
  document_type: string;
  version_status: string;
  updated_at: Date;
  score: number | string;
  raw_snippet: string | null;
  total: number | string;
}

interface SearchFacetDbRow {
  facets: unknown;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function filterRefs(input: SearchQueryDto, scopeRules: readonly string[] = []): string {
  const refs: string[] = [];
  const filters = input.filters;
  if (filters) {
    if (filters.matterId) refs.push(`matter_id:${filters.matterId}`);
    if (filters.clientId) refs.push(`client_id:${filters.clientId}`);
    if (filters.documentType) {
      const value = Array.isArray(filters.documentType)
        ? filters.documentType.join(',')
        : filters.documentType;
      refs.push(`document_type:${value}`);
    }
    if (filters.dateFrom || filters.dateTo) {
      refs.push(`date_range:${filters.dateFrom ?? ''}..${filters.dateTo ?? ''}`);
    }
    refs.push(`version_status:${filters.versionStatus ?? 'current'}`);
  }
  if (scopeRules.length > 0) {
    refs.push(`scope:${[...new Set(scopeRules)].join(',')}`);
  }
  return (refs.join('|') || 'none').slice(0, 256);
}

function searchAuditMetadata(
  input: SearchQueryDto,
  resultCount: number,
  durationMs: number,
  scopeRules: readonly string[] = [],
): AuditMetadata {
  const query = input.query ?? '';
  return {
    query_hash: sha256Hex(query),
    query_length: query.length,
    filter_refs: filterRefs(input, scopeRules),
    result_count: resultCount,
    duration_ms: durationMs,
  };
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchQueryBuilder) private readonly queryBuilder: SearchQueryBuilder,
    @Inject(SnippetBuilder) private readonly snippetBuilder: SnippetBuilder,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
  ) {}

  async search(ctx: SearchRequestContext, input: SearchQueryDto): Promise<SearchResponseDto> {
    const startedAt = performance.now();
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      await this.auditDenied(ctx, input, startedAt);
      throw permissionDenied();
    }

    if (scopeDecision.effect !== 'ALLOW') {
      await this.auditDenied(ctx, input, startedAt);
      throw permissionDenied();
    }

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const built = this.queryBuilder.build(input, scopeDecision.scope);
      const facetQuery = this.queryBuilder.buildFacets(input, scopeDecision.scope);
      const result = await client.query(built.sql, built.params);
      const facetResult = await client.query(facetQuery.sql, facetQuery.params);
      const rows = result.rows as SearchDbRow[];
      const facetRows = facetResult.rows as SearchFacetDbRow[];
      const response = this.mapRows(rows, parseFacets(facetRows[0]?.facets));
      await this.recordSearchAudit(
        client,
        ctx,
        input,
        'success',
        response.total,
        startedAt,
        scopeDecision.appliedRules,
      );
      return response;
    });
  }

  private async auditDenied(
    ctx: SearchRequestContext,
    input: SearchQueryDto,
    startedAt: number,
  ): Promise<void> {
    await this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.recordSearchAudit(client, ctx, input, 'denied', 0, startedAt);
    });
  }

  private async recordSearchAudit(
    client: QueryClient,
    ctx: SearchRequestContext,
    input: SearchQueryDto,
    result: 'success' | 'denied',
    resultCount: number,
    startedAt: number,
    scopeRules: readonly string[] = [],
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'SEARCH_EXECUTED',
        targetType: 'search',
        result,
        metadata: searchAuditMetadata(
          input,
          resultCount,
          Math.round(performance.now() - startedAt),
          scopeRules,
        ),
      },
      client,
    );
  }

  private mapRows(rows: SearchDbRow[], facets: SearchFacetsDto): SearchResponseDto {
    const total = Number(rows[0]?.total ?? 0);
    return {
      facets,
      total,
      results: rows.map((row): SearchResultDto => {
        const parsed = this.snippetBuilder.parseHeadline(row.raw_snippet);
        return {
          documentId: row.document_id,
          versionId: row.version_id,
          matterId: row.matter_id,
          clientId: row.client_id,
          title: row.title,
          snippet: parsed.snippet,
          highlights: parsed.highlights,
          documentType: row.document_type,
          versionStatus: row.version_status,
          score: Number(row.score),
          updatedAt: row.updated_at.toISOString(),
        };
      }),
    };
  }
}

const emptyFacets: SearchFacetsDto = {
  clients: [],
  matters: [],
  documentTypes: [],
  versionStatuses: [],
  dateRanges: [],
};

function parseFacets(input: unknown): SearchFacetsDto {
  if (!isRecord(input)) return emptyFacets;
  return {
    clients: parseBuckets(input.clients),
    matters: parseBuckets(input.matters),
    documentTypes: parseBuckets(input.documentTypes),
    versionStatuses: parseBuckets(input.versionStatuses),
    dateRanges: parseDateRanges(input.dateRanges),
  };
}

function parseBuckets(input: unknown): SearchFacetBucketDto[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!isRecord(item) || typeof item.value !== 'string') return [];
    const count = Number(item.count);
    if (!Number.isFinite(count) || count <= 0) return [];
    return [{ value: item.value, count }];
  });
}

function parseDateRanges(input: unknown): SearchFacetsDto['dateRanges'] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item) => {
    if (!isRecord(item) || typeof item.value !== 'string' || typeof item.label !== 'string') {
      return [];
    }
    const count = Number(item.count);
    if (!Number.isFinite(count) || count <= 0) return [];
    return [{ value: item.value, label: item.label, count }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
