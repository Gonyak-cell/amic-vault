import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  AuditMetadata,
  MatterSuggestionDto,
  MatterSuggestionListDto,
  MatterSuggestionQueryDto,
  SearchMode,
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
import type { SearchSqlFragment } from './query/search-filter.builder';
import { SearchQueryBuilder } from './query/search-query.builder';
import { SnippetBuilder } from './query/snippet-builder';
import { deterministicEmbeddingVector, vectorToSqlLiteral } from './semantic/local-embedding';

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

interface MatterSuggestionDbRow {
  matter_id: string;
  matter_code: string;
  matter_name: string;
  client_id: string;
  reason_codes: string[] | null;
  score: number | string;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function searchMode(input: SearchQueryDto): SearchMode {
  return input.mode ?? 'keyword';
}

function filterRefs(input: SearchQueryDto, scopeRules: readonly string[] = []): string {
  const refs: string[] = [];
  refs.push(`mode:${searchMode(input)}`);
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
    scope_type: searchMode(input),
  };
}

function outlookSuggestionFilterRefs(
  input: MatterSuggestionQueryDto,
  scopeRules: readonly string[] = [],
): string {
  const refs = [
    `source:${input.sourceClient}`,
    `participant_domain_hashes:${input.participantDomainHashes.length}`,
    `subject_hash:${input.subjectHash ? 'present' : 'absent'}`,
    `conversation_hash:${input.conversationIdHash ? 'present' : 'absent'}`,
  ];
  if (scopeRules.length > 0) {
    refs.push(`scope:${[...new Set(scopeRules)].join(',')}`);
  }
  return refs.join('|').slice(0, 256);
}

function matterSuggestionAuditMetadata(
  input: MatterSuggestionQueryDto,
  resultCount: number,
  durationMs: number,
  result: 'success' | 'denied',
  scopeRules: readonly string[] = [],
): AuditMetadata {
  const queryRef = {
    sourceClient: input.sourceClient,
    mailboxFingerprint: input.mailboxFingerprint,
    participantDomainHashes: [...input.participantDomainHashes].sort(),
    subjectHash: input.subjectHash ?? null,
    conversationIdHash: input.conversationIdHash ?? null,
    limit: input.limit,
  };
  return {
    query_hash: sha256Hex(JSON.stringify(queryRef)),
    query_length:
      input.participantDomainHashes.length +
      (input.subjectHash ? 1 : 0) +
      (input.conversationIdHash ? 1 : 0),
    filter_refs: outlookSuggestionFilterRefs(input, scopeRules),
    result_count: resultCount,
    duration_ms: durationMs,
    scope_type: 'outlook_matter_suggestions',
    mailbox_fingerprint_hash: input.mailboxFingerprint,
    outlook_status: result === 'success' ? 'suggestions_viewed' : 'denied',
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
      const mode = searchMode(input);
      const queryVector =
        mode === 'keyword'
          ? null
          : vectorToSqlLiteral(deterministicEmbeddingVector(input.query ?? ''));
      const built =
        mode === 'keyword'
          ? this.queryBuilder.build(input, scopeDecision.scope)
          : this.queryBuilder.buildVector(input, scopeDecision.scope, queryVector!, mode);
      const facetQuery =
        mode === 'keyword'
          ? this.queryBuilder.buildFacets(input, scopeDecision.scope)
          : this.queryBuilder.buildVectorFacets(input, scopeDecision.scope, queryVector!, mode);
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

  async suggestMatters(
    ctx: SearchRequestContext,
    input: MatterSuggestionQueryDto,
  ): Promise<MatterSuggestionListDto> {
    const startedAt = performance.now();
    let scopeDecision: Awaited<ReturnType<SearchPermissionScopeProvider['scopeForSearch']>>;
    try {
      scopeDecision = await this.scopeProvider.scopeForSearch(ctx);
    } catch {
      await this.auditMatterSuggestionsDenied(ctx, input, startedAt);
      throw permissionDenied();
    }

    if (scopeDecision.effect !== 'ALLOW') {
      await this.auditMatterSuggestionsDenied(ctx, input, startedAt);
      throw permissionDenied();
    }

    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const built = this.buildMatterSuggestionQuery(scopeDecision.scope, input);
      const result = await client.query(built.sql, built.params);
      const rows = result.rows as MatterSuggestionDbRow[];
      const response = { items: rows.map(mapMatterSuggestionRow) };
      await this.recordMatterSuggestionAudit(
        client,
        ctx,
        input,
        'success',
        response.items.length,
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

  private async auditMatterSuggestionsDenied(
    ctx: SearchRequestContext,
    input: MatterSuggestionQueryDto,
    startedAt: number,
  ): Promise<void> {
    await this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.recordMatterSuggestionAudit(client, ctx, input, 'denied', 0, startedAt);
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

  private async recordMatterSuggestionAudit(
    client: QueryClient,
    ctx: SearchRequestContext,
    input: MatterSuggestionQueryDto,
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
        action: 'OUTLOOK_MATTER_SUGGESTIONS_VIEWED',
        targetType: 'outlook_matter_suggestions',
        result,
        metadata: matterSuggestionAuditMetadata(
          input,
          resultCount,
          Math.round(performance.now() - startedAt),
          result,
          scopeRules,
        ),
      },
      client,
    );
  }

  private buildMatterSuggestionQuery(
    scope: SearchSqlFragment,
    input: MatterSuggestionQueryDto,
  ): { sql: string; params: unknown[] } {
    const bound = bindSearchScope(scope);
    const params = [...bound.params];
    const deletedParam = pushParam(params, 'deleted');
    const currentParam = pushParam(params, 'current');
    const subjectParam = pushParam(params, input.subjectHash ?? null);
    const participantDomainHashesParam = pushParam(params, input.participantDomainHashes);
    const limitParam = pushParam(params, input.limit);
    const subjectHashSql = (expression: string) => `
      nullif(lower(trim(${expression})), '') IS NOT NULL
      AND encode(digest(lower(trim(${expression})), 'sha256'), 'hex') = ${subjectParam}::text
    `;
    const domainHashSql = (expression: string) => `
      nullif(lower(trim(coalesce(${expression}, ''))), '') IS NOT NULL
      AND encode(digest(lower(trim(coalesce(${expression}, ''))), 'sha256'), 'hex')
        = ANY(${participantDomainHashesParam}::text[])
    `;

    return {
      sql: `
        WITH authorized_idx AS (
          SELECT idx.tenant_id, idx.matter_id, idx.client_id, max(idx.updated_at) AS latest_indexed_at
          FROM document_search_index idx
          WHERE (${bound.sql})
            AND idx.document_status <> ${deletedParam}
            AND idx.version_status = ${currentParam}
          GROUP BY idx.tenant_id, idx.matter_id, idx.client_id
        ),
        candidates AS (
          SELECT
            m.matter_id,
            m.matter_code,
            m.matter_name,
            m.client_id,
            authorized_idx.latest_indexed_at,
            (
              ${subjectParam}::text IS NOT NULL
              AND (
                (${subjectHashSql('m.matter_code')})
                OR (${subjectHashSql('m.matter_name')})
                OR (${subjectHashSql('c.name')})
              )
            ) AS subject_hash_match,
            (
              cardinality(${participantDomainHashesParam}::text[]) > 0
              AND (
                (${domainHashSql("m.metadata_json->>'domain'")})
                OR (${domainHashSql("c.metadata_json->>'domain'")})
              )
            ) AS participant_domain_hash_match
          FROM authorized_idx
          JOIN matters m
            ON m.tenant_id = authorized_idx.tenant_id
           AND m.matter_id = authorized_idx.matter_id
          JOIN clients c
            ON c.tenant_id = m.tenant_id
           AND c.client_id = m.client_id
        )
        SELECT
          matter_id,
          matter_code,
          matter_name,
          client_id,
          array_remove(ARRAY[
            CASE WHEN subject_hash_match THEN 'subject_hash' END,
            CASE WHEN participant_domain_hash_match THEN 'participant_domain_hash' END
          ], NULL) AS reason_codes,
          ((CASE WHEN subject_hash_match THEN 70 ELSE 0 END)
            + (CASE WHEN participant_domain_hash_match THEN 30 ELSE 0 END))::int AS score
        FROM candidates
        WHERE subject_hash_match OR participant_domain_hash_match
        ORDER BY score DESC, latest_indexed_at DESC, matter_code ASC, matter_id ASC
        LIMIT ${limitParam}
      `,
      params,
    };
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

function pushParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function bindSearchScope(scope: SearchSqlFragment): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let nextParam = 0;
  const sql = scope.sql.replace(/\?/g, () => {
    if (nextParam >= scope.params.length) {
      throw new Error('Search SQL fragment has fewer params than placeholders');
    }
    params.push(scope.params[nextParam]);
    nextParam += 1;
    return `$${params.length}`;
  });
  if (nextParam !== scope.params.length) {
    throw new Error('Search SQL fragment has more params than placeholders');
  }
  return { sql, params };
}

function mapMatterSuggestionRow(row: MatterSuggestionDbRow): MatterSuggestionDto {
  return {
    matterId: row.matter_id,
    matterCode: row.matter_code,
    matterName: row.matter_name,
    clientId: row.client_id,
    reasonCodes: parseMatterSuggestionReasonCodes(row.reason_codes),
    score: Number(row.score),
  };
}

function parseMatterSuggestionReasonCodes(
  input: string[] | null,
): MatterSuggestionDto['reasonCodes'] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value) => {
    if (value === 'subject_hash' || value === 'participant_domain_hash') return [value];
    return [];
  });
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
