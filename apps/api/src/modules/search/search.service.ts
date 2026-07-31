import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  AuditMetadata,
  CreateSavedSearchDto,
  EmailMatterSuggestionConfidenceBand,
  MatterSuggestionDto,
  MatterSuggestionListDto,
  MatterSuggestionQueryDto,
  SavedSearchDto,
  SavedSearchListDto,
  SearchFolderScope,
  SearchHighlightDto,
  SearchMode,
  SearchFacetBucketDto,
  SearchFacetsDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchResultDto,
} from '@amic-vault/shared';
import { buildSafeLabel, searchQuerySchema } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import {
  failClosedSavedSearchPermissionScopeCtes,
  SEARCH_PERMISSION_SCOPE_PROVIDER,
  type SearchPermissionScopeProvider,
  type SearchRequestContext,
} from './permission/search-permission-scope.provider';
import type { SearchSqlFragment } from './query/search-filter.builder';
import { SearchQueryBuilder } from './query/search-query.builder';
import { SnippetBuilder } from './query/snippet-builder';
import {
  createDefaultSearchEmbeddingGateway,
  SEARCH_EMBEDDING_GATEWAY,
  type SearchEmbeddingGateway,
} from './index/search-index.repository';
import { vectorToSqlLiteral } from './semantic/local-embedding';
import {
  LawAuthoritySearchRepository,
  type LawAuthoritySearchRow,
} from '../integrations/law-data/law-authority-search.repository';

interface SearchDbRow {
  clause_id?: string | null;
  clause_kind?: string | null;
  clause_number?: string | null;
  document_id: string;
  version_id: string;
  matter_id: string;
  matter_name: string | null;
  matter_code: string | null;
  client_id: string;
  client_name: string | null;
  title: string;
  author_user_id: string;
  author_name: string | null;
  confidentiality_level: string | null;
  legal_hold: string | null;
  privilege_status: string | null;
  ai_allowed: boolean | null;
  prev_version_id: string | null;
  next_version_id: string | null;
  document_type: string;
  extraction_status: string | null;
  content_truncated: boolean | null;
  version_status: string;
  updated_at: Date;
  score: number | string;
  raw_snippet: string | null;
  result_kind?: string | null;
  total?: number | string;
}

interface SearchFacetDbRow {
  facets: unknown;
}

const boundedSearchTotalScanLimit = 101;
const cappedSearchTotal = 1001;

interface MatterSuggestionDbRow {
  matter_id: string;
  matter_code: string;
  matter_name: string;
  client_id: string;
  reason_codes: string[] | null;
  score: number | string;
  confidence: number | string;
  confidence_band: EmailMatterSuggestionConfidenceBand;
}

interface SavedSearchDbRow {
  can_revoke?: boolean;
  created_at: Date;
  filter_refs: string;
  last_opened_at: Date | null;
  matter_id: string | null;
  name: string;
  opened_count: number | string;
  query_hash: string;
  saved_search_id: string;
  scope_type: string;
  search_query_json: unknown;
  updated_at: Date;
}

interface SavedSearchActorRow {
  role: string;
  status: string;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

const internalSavedSearchRoles = [
  'firm_admin',
  'security_admin',
  'matter_owner',
  'matter_member',
  'limited_reviewer',
  'knowledge_manager',
] as const;

const savedSearchQueryMatterIdText = `(s.search_query_json #>> '{filters,matterId}')`;
const savedSearchQueryMatterId = `
  CASE
    WHEN ${savedSearchQueryMatterIdText} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ${savedSearchQueryMatterIdText}::uuid
    ELSE NULL::uuid
  END
`;
const savedSearchEffectiveMatterId = `COALESCE(s.matter_id, (${savedSearchQueryMatterId}))`;
const savedSearchMatterAuthorizationWhere = `
  (
    (${savedSearchQueryMatterIdText} IS NULL AND s.matter_id IS NULL)
    OR (
      (
        ${savedSearchQueryMatterIdText} IS NULL
        OR (
          (${savedSearchQueryMatterId}) IS NOT NULL
          AND (
            s.matter_id IS NULL
            OR s.matter_id = (${savedSearchQueryMatterId})
          )
        )
      )
      AND ${savedSearchEffectiveMatterId} IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM allowed_matter_ids allowed
        WHERE allowed.matter_id = ${savedSearchEffectiveMatterId}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM wall_blocked_matter_ids blocked
        WHERE blocked.matter_id = ${savedSearchEffectiveMatterId}
      )
    )
  )
`;

const visibleSavedSearchWhere = `
  actor.status = 'active'
  AND actor.role = ANY($3::text[])
  AND s.tenant_id = $1
  AND s.revoked_at IS NULL
  AND (
    (s.scope_type = 'personal' AND s.user_id = $2)
    OR s.scope_type = 'admin-shared'
    OR (
      s.scope_type = 'matter-team'
      AND s.matter_id IS NOT NULL
    )
  )
  AND ${savedSearchMatterAuthorizationWhere}
`;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function searchMode(input: SearchQueryDto): SearchMode {
  return input.mode ?? 'keyword';
}

function filterRefs(input: SearchQueryDto, scopeRules: readonly string[] = []): string {
  const refs: string[] = [];
  refs.push(`mode:${searchMode(input)}`);
  refs.push(`target:${input.target ?? 'all'}`);
  refs.push(`sort:${input.sortBy ?? 'relevance'}`);
  refs.push(`group:${input.groupBy ?? 'none'}`);
  const filters = input.filters;
  if (filters) {
    if (filters.matterId) refs.push(`matter_id:${filters.matterId}`);
    if (filters.clientId) refs.push(`client_id:${filters.clientId}`);
    if (filters.matterCode) refs.push('matter_code_filter:present');
    if (filters.matterName) refs.push('matter_name_filter:present');
    if (filters.clientName) refs.push('client_name_filter:present');
    if (filters.title) refs.push('title_filter:present');
    if (filters.confidentialityLevel) {
      refs.push(`confidentiality_level:${filters.confidentialityLevel}`);
    }
    if (filters.documentType) {
      const value = Array.isArray(filters.documentType)
        ? filters.documentType.join(',')
        : filters.documentType;
      refs.push(`document_type:${value}`);
    }
    if (filters.extractionStatus) {
      refs.push(`extraction_status:${filters.extractionStatus}`);
    }
    if (filters.ocrConfidence) {
      refs.push(`ocr_confidence:${filters.ocrConfidence}`);
    }
    if (filters.legalHold) {
      refs.push(`legal_hold:${filters.legalHold}`);
    }
    if (filters.recordsStatus) {
      refs.push(`records_status:${filters.recordsStatus}`);
    }
    if (filters.privilegeStatus) {
      refs.push(`privilege_status:${filters.privilegeStatus}`);
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

function isAdminRole(role: string | undefined): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

function isInternalSavedSearchRole(role: string | undefined): boolean {
  return internalSavedSearchRoles.includes(role as (typeof internalSavedSearchRoles)[number]);
}

function parseSavedSearchScope(value: string): SearchFolderScope {
  if (value === 'matter-team' || value === 'admin-shared') return value;
  return 'personal';
}

function savedSearchFilterRefs(
  operation: 'open' | 'revoke' | 'save',
  input: SearchQueryDto,
  scope: SearchFolderScope,
): string {
  return `saved_search:${operation}|folder_scope:${scope}|${filterRefs(input)}`.slice(0, 256);
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
    search_mode: searchMode(input),
    zero_result: resultCount === 0,
  };
}

const koreanParticleSuffixes = [
  '에서',
  '에게',
  '으로',
  '부터',
  '까지',
  '보다',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '과',
  '와',
  '도',
  '만',
  '에',
  '로',
  '께',
] as const;

const koreanVerbSuffixes = [
  '하였다',
  '합니다',
  '한다',
  '했다',
  '된다',
  '되는',
  '하여',
  '하고',
  '하는',
  '하다',
  '된',
  '한',
  '할',
] as const;

function stripKoreanSearchSuffixes(input: string): string {
  let value = input;
  for (const suffix of [...koreanParticleSuffixes, ...koreanVerbSuffixes]) {
    if (value.length > suffix.length + 1 && value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return value;
}

function fallbackHighlightNeedles(query: string): string[] {
  const candidates = query
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/u)
    .flatMap((token) => [token, stripKoreanSearchSuffixes(token)])
    .filter((token) => token.length >= 2);
  return [...new Set(candidates)].sort((left, right) => right.length - left.length);
}

function koreanFallbackHighlights(snippet: string, query: string): SearchHighlightDto[] {
  const lowerSnippet = snippet.toLowerCase();
  const highlights: SearchHighlightDto[] = [];
  for (const needle of fallbackHighlightNeedles(query)) {
    let fromIndex = 0;
    while (fromIndex < lowerSnippet.length) {
      const start = lowerSnippet.indexOf(needle, fromIndex);
      if (start < 0) break;
      const end = start + needle.length;
      const overlaps = highlights.some(
        (highlight) => start < highlight.end && end > highlight.start,
      );
      if (!overlaps) highlights.push({ start, end });
      fromIndex = end;
    }
  }
  return highlights.sort((left, right) => left.start - right.start).slice(0, 8);
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

function previewAnchorsForHighlights(
  highlights: readonly SearchHighlightDto[],
): SearchHighlightDto[] {
  return highlights.slice(0, 50).map((highlight, index) => ({
    ...highlight,
    anchorId: previewAnchorId(index, highlight),
  }));
}

function previewAnchorId(index: number, highlight: SearchHighlightDto): string {
  const safeIndex = Math.max(1, Math.min(index + 1, 50));
  const safeStart = boundedPreviewOffset(highlight.start, 0);
  const safeEnd = Math.max(safeStart, boundedPreviewOffset(highlight.end, safeStart));
  return `vph-${safeIndex}-${safeStart}-${safeEnd}`;
}

function boundedPreviewOffset(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.trunc(value), 200));
}

@Injectable()
export class SearchService {
  private readonly embeddingGateway: SearchEmbeddingGateway;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchQueryBuilder) private readonly queryBuilder: SearchQueryBuilder,
    @Inject(SnippetBuilder) private readonly snippetBuilder: SnippetBuilder,
    @Inject(SEARCH_PERMISSION_SCOPE_PROVIDER)
    private readonly scopeProvider: SearchPermissionScopeProvider,
    @Optional()
    @Inject(SEARCH_EMBEDDING_GATEWAY)
    embeddingGateway?: SearchEmbeddingGateway,
    @Optional()
    @Inject(LawAuthoritySearchRepository)
    private readonly authoritySearch?: LawAuthoritySearchRepository,
  ) {
    this.embeddingGateway = embeddingGateway ?? createDefaultSearchEmbeddingGateway();
  }

  async search(ctx: SearchRequestContext, input: SearchQueryDto): Promise<SearchResponseDto> {
    const startedAt = performance.now();
    if (String(input.target ?? 'all') === 'authority') {
      return this.searchAuthorities(ctx, input, startedAt);
    }

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
        mode === 'keyword' ? null : await this.queryEmbeddingVectorLiteral(input.query ?? '');
      if (mode !== 'keyword' && !queryVector) {
        const response = emptySearchResponse();
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
      }
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
      const response = this.mapRows(rows, parseFacets(facetRows[0]?.facets), input);
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

  private async searchAuthorities(
    ctx: SearchRequestContext,
    input: SearchQueryDto,
    startedAt: number,
  ): Promise<SearchResponseDto> {
    if (!this.authoritySearch) {
      throw new Error('authority search repository is not configured');
    }
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const authorityInput: Parameters<LawAuthoritySearchRepository['search']>[1] = {
        page: input.page,
        pageSize: input.pageSize,
        query: input.query,
        ...(input.sortBy ? { sortBy: input.sortBy } : {}),
      };
      const rows = await this.authoritySearch!.search(client, authorityInput);
      const response = this.mapAuthorityRows(rows, input.query);
      await this.recordSearchAudit(client, ctx, input, 'success', response.total, startedAt, [
        'authority_public_cache',
      ]);
      return response;
    });
  }

  private async queryEmbeddingVectorLiteral(query: string): Promise<string | null> {
    const embeddingResult = await this.embeddingGateway.embedText({ text: query });
    if (embeddingResult.status !== 'completed' || !embeddingResult.embedding) return null;
    return vectorToSqlLiteral(embeddingResult.embedding);
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

  async listSavedSearches(ctx: SearchRequestContext): Promise<SavedSearchListDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query(
        `
          WITH ${failClosedSavedSearchPermissionScopeCtes}
          SELECT
            s.saved_search_id,
            s.name,
            s.scope_type,
            s.matter_id,
            s.search_query_json,
            s.query_hash,
            s.filter_refs,
            s.opened_count,
            s.last_opened_at,
            s.created_at,
            s.updated_at,
            (s.user_id = $2 OR actor.role = ANY($4::text[])) AS can_revoke
          FROM saved_searches s
          CROSS JOIN actor_row actor
          WHERE ${visibleSavedSearchWhere}
          ORDER BY
            CASE s.scope_type
              WHEN 'personal' THEN 0
              WHEN 'matter-team' THEN 1
              ELSE 2
            END,
            s.updated_at DESC,
            s.name ASC,
            s.saved_search_id ASC
          LIMIT 50
        `,
        [ctx.tenantId, ctx.userId, [...internalSavedSearchRoles], ['firm_admin', 'security_admin']],
      );
      return { items: (result.rows as SavedSearchDbRow[]).map(mapSavedSearchRow) };
    });
  }

  async saveSavedSearch(
    ctx: SearchRequestContext,
    input: CreateSavedSearchDto,
  ): Promise<SavedSearchDto> {
    const queryHash = sha256Hex(input.query.query ?? '');
    const refs = filterRefs(input.query);
    const scope = input.scope ?? 'personal';
    const queryMatterId = input.query.filters?.matterId ?? null;
    if (input.matterId && queryMatterId && input.matterId !== queryMatterId) {
      throw permissionDenied();
    }
    const matterId = input.matterId ?? queryMatterId;
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      await this.assertCanSaveSavedSearch(client, ctx, scope, matterId);
      const result = await client.query(
        `
          WITH ${failClosedSavedSearchPermissionScopeCtes}
          INSERT INTO saved_searches (
            tenant_id,
            user_id,
            name,
            scope_type,
            matter_id,
            search_query_json,
            query_hash,
            filter_refs
          )
          SELECT $1, $2, $3, $4, $5::uuid, $6::jsonb, $7, $8
          FROM actor_row actor
          WHERE actor.status = 'active'
            AND actor.role = ANY($9::text[])
            AND (
              $5::uuid IS NULL
              OR (
                EXISTS (
                  SELECT 1
                  FROM allowed_matter_ids allowed
                  WHERE allowed.matter_id = $5::uuid
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM wall_blocked_matter_ids blocked
                  WHERE blocked.matter_id = $5::uuid
                )
              )
            )
            AND (
              $4 = 'personal'
              OR ($4 = 'admin-shared' AND actor.role = ANY($10::text[]))
              OR ($4 = 'matter-team' AND $5::uuid IS NOT NULL)
            )
          ON CONFLICT (tenant_id, user_id, name)
          DO UPDATE SET
            scope_type = EXCLUDED.scope_type,
            matter_id = EXCLUDED.matter_id,
            search_query_json = EXCLUDED.search_query_json,
            query_hash = EXCLUDED.query_hash,
            filter_refs = EXCLUDED.filter_refs,
            revoked_at = NULL,
            revoked_by = NULL,
            updated_at = now()
          RETURNING
            saved_search_id,
            name,
            scope_type,
            matter_id,
            search_query_json,
            query_hash,
            filter_refs,
            opened_count,
            last_opened_at,
            created_at,
            updated_at,
            true AS can_revoke
        `,
        [
          ctx.tenantId,
          ctx.userId,
          input.name.trim(),
          scope,
          matterId,
          JSON.stringify(input.query),
          queryHash,
          refs,
          [...internalSavedSearchRoles],
          ['firm_admin', 'security_admin'],
        ],
      );
      const row = result.rows[0] as SavedSearchDbRow | undefined;
      if (!row) throw permissionDenied();
      const saved = mapSavedSearchRow(row);
      await this.recordSavedSearchAudit(client, ctx, saved, 'save');
      return saved;
    });
  }

  async deleteSavedSearch(ctx: SearchRequestContext, savedSearchId: string): Promise<void> {
    await this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query(
        `
          WITH ${failClosedSavedSearchPermissionScopeCtes},
          authorized AS (
            SELECT s.saved_search_id
            FROM saved_searches s
            CROSS JOIN actor_row actor
            WHERE ${visibleSavedSearchWhere}
              AND s.saved_search_id = $5
              AND (
                s.user_id = $2
                OR (s.scope_type <> 'personal' AND actor.role = ANY($4::text[]))
              )
            LIMIT 1
          )
          UPDATE saved_searches s
          SET revoked_at = now(),
              revoked_by = $2,
              updated_at = now()
          FROM authorized
          WHERE s.tenant_id = $1
            AND s.saved_search_id = authorized.saved_search_id
          RETURNING
            s.saved_search_id,
            s.name,
            s.scope_type,
            s.matter_id,
            s.search_query_json,
            s.query_hash,
            s.filter_refs,
            s.opened_count,
            s.last_opened_at,
            s.created_at,
            s.updated_at,
            true AS can_revoke
        `,
        [
          ctx.tenantId,
          ctx.userId,
          [...internalSavedSearchRoles],
          ['firm_admin', 'security_admin'],
          savedSearchId,
        ],
      );
      const row = result.rows[0] as SavedSearchDbRow | undefined;
      if (!row) throw permissionDenied();
      await this.recordSavedSearchAudit(client, ctx, mapSavedSearchRow(row), 'revoke');
    });
  }

  async recordSavedSearchOpen(
    ctx: SearchRequestContext,
    savedSearchId: string,
  ): Promise<SavedSearchDto> {
    return this.auditService.transaction(ctx.tenantId, async (client) => {
      const result = await client.query(
        `
          WITH ${failClosedSavedSearchPermissionScopeCtes},
          visible AS (
            SELECT
              s.saved_search_id,
              (s.user_id = $2 OR actor.role = ANY($4::text[])) AS can_revoke
            FROM saved_searches s
            CROSS JOIN actor_row actor
            WHERE ${visibleSavedSearchWhere}
              AND s.saved_search_id = $5
            LIMIT 1
          )
          UPDATE saved_searches s
          SET opened_count = s.opened_count + 1,
              last_opened_at = now()
          FROM visible
          WHERE s.tenant_id = $1
            AND s.saved_search_id = visible.saved_search_id
          RETURNING
            s.saved_search_id,
            s.name,
            s.scope_type,
            s.matter_id,
            s.search_query_json,
            s.query_hash,
            s.filter_refs,
            s.opened_count,
            s.last_opened_at,
            s.created_at,
            s.updated_at,
            visible.can_revoke
        `,
        [
          ctx.tenantId,
          ctx.userId,
          [...internalSavedSearchRoles],
          ['firm_admin', 'security_admin'],
          savedSearchId,
        ],
      );
      const row = result.rows[0] as SavedSearchDbRow | undefined;
      if (!row) throw permissionDenied();
      const saved = mapSavedSearchRow(row);
      await this.recordSavedSearchAudit(client, ctx, saved, 'open');
      return saved;
    });
  }

  private async assertCanSaveSavedSearch(
    client: QueryClient,
    ctx: SearchRequestContext,
    scope: SearchFolderScope,
    matterId: string | null,
  ): Promise<void> {
    const actor = await this.lookupSavedSearchActor(client, ctx);
    if (!actor || actor.status !== 'active' || !isInternalSavedSearchRole(actor.role)) {
      throw permissionDenied();
    }
    if (scope === 'admin-shared') {
      if (!isAdminRole(actor.role)) throw permissionDenied();
      return;
    }
    if (scope === 'matter-team') {
      if (!matterId) throw permissionDenied();
    }
  }

  private async lookupSavedSearchActor(
    client: QueryClient,
    ctx: SearchRequestContext,
  ): Promise<SavedSearchActorRow | null> {
    const result = await client.query(
      `
        SELECT role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [ctx.tenantId, ctx.userId],
    );
    return (result.rows[0] as SavedSearchActorRow | undefined) ?? null;
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

  private async recordSavedSearchAudit(
    client: QueryClient,
    ctx: SearchRequestContext,
    saved: SavedSearchDto,
    operation: 'open' | 'revoke' | 'save',
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        sessionId: ctx.sessionId ?? null,
        action: 'SEARCH_EXECUTED',
        targetType: 'saved_search',
        targetId: saved.savedSearchId,
        result: 'success',
        metadata: {
          filter_refs: savedSearchFilterRefs(operation, saved.query, saved.scope),
          query_hash: sha256Hex(saved.query.query ?? ''),
          query_length: saved.query.query?.length ?? 0,
          request_id: saved.savedSearchId,
          result_count: 0,
          scope_type: saved.scope,
        },
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
    const conversationHashParam = pushParam(params, input.conversationIdHash ?? null);
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
            ) AS participant_domain_hash_match,
            (
              ${conversationHashParam}::text IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM email_matter_filings emf
                JOIN email_messages em
                  ON em.tenant_id = emf.tenant_id
                 AND em.email_id = emf.email_id
                WHERE emf.tenant_id = m.tenant_id
                  AND emf.matter_id = m.matter_id
                  AND em.conversation_id_hash = ${conversationHashParam}::text
              )
            ) AS conversation_hash_match
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
            CASE WHEN participant_domain_hash_match THEN 'participant_domain_hash' END,
            CASE WHEN conversation_hash_match THEN 'conversation_hash' END
          ], NULL) AS reason_codes,
          ((CASE WHEN conversation_hash_match THEN 95 ELSE 0 END)
            + (CASE WHEN subject_hash_match THEN 70 ELSE 0 END)
            + (CASE WHEN participant_domain_hash_match THEN 30 ELSE 0 END))::int AS score,
          CASE
            WHEN conversation_hash_match THEN 97
            WHEN subject_hash_match AND participant_domain_hash_match THEN 83
            WHEN participant_domain_hash_match THEN 58
            WHEN subject_hash_match THEN 50
            ELSE 0
          END::int AS confidence,
          CASE
            WHEN conversation_hash_match THEN 'auto_file'
            WHEN subject_hash_match AND participant_domain_hash_match THEN 'confirm'
            WHEN participant_domain_hash_match OR subject_hash_match THEN 'candidate'
            ELSE 'manual'
          END::text AS confidence_band
        FROM candidates
        WHERE subject_hash_match OR participant_domain_hash_match OR conversation_hash_match
        ORDER BY conversation_hash_match DESC, score DESC, latest_indexed_at DESC, matter_code ASC, matter_id ASC
        LIMIT ${limitParam}
      `,
      params,
    };
  }

  private mapRows(
    rows: SearchDbRow[],
    facets: SearchFacetsDto,
    input: SearchQueryDto,
  ): SearchResponseDto {
    const pageSize = input.pageSize;
    const visibleRows = rows.slice(0, pageSize);
    const offset = (input.page - 1) * pageSize;
    const total =
      rows.length >= boundedSearchTotalScanLimit ? cappedSearchTotal : offset + rows.length;
    return {
      facets,
      total,
      results: visibleRows.map((row): SearchResultDto => {
        const clauseId = row.clause_id;
        const clauseFields =
          row.result_kind === 'clause' && clauseId
            ? {
                clauseId,
                clauseKind: row.clause_kind ?? null,
                clauseNumber: row.clause_number ?? null,
                resultKind: 'clause' as const,
              }
            : { resultKind: 'document' as const };
        const parsed = this.snippetBuilder.parseHeadline(row.raw_snippet);
        const highlights =
          parsed.highlights.length > 0 || !input.query
            ? parsed.highlights
            : koreanFallbackHighlights(parsed.snippet, input.query);
        return {
          documentId: row.document_id,
          versionId: row.version_id,
          matterId: row.matter_id,
          matterDisplayName: row.matter_name,
          matterDisplayCode: row.matter_code,
          clientId: row.client_id,
          clientDisplayName: row.client_name,
          title: row.title,
          displayName: row.title,
          safeLabel: buildSafeLabel(row.title, row.matter_code, row.matter_name),
          canViewSensitiveRef: false,
          ...clauseFields,
          author: row.author_user_id
            ? { userId: row.author_user_id, displayName: row.author_name ?? null }
            : null,
          permissionBadges: {
            confidentiality: parseConfidentialityLevel(row.confidentiality_level),
            legalHold: parseLegalHold(row.legal_hold),
            privilege: parsePrivilegeStatus(row.privilege_status),
          },
          aiAllowed: row.ai_allowed === true,
          contentTruncated: row.content_truncated === true,
          prevVersionId: row.prev_version_id,
          nextVersionId: row.next_version_id,
          snippet: parsed.snippet,
          highlights: previewAnchorsForHighlights(highlights),
          documentType: row.document_type,
          extractionStatus: parseExtractionStatus(row.extraction_status),
          versionStatus: row.version_status,
          score: Number(row.score),
          updatedAt: row.updated_at.toISOString(),
        };
      }),
    };
  }

  private mapAuthorityRows(
    rows: LawAuthoritySearchRow[],
    query: string | undefined,
  ): SearchResponseDto {
    const total = Number(rows[0]?.total ?? 0);
    return {
      facets: emptyFacets,
      total,
      results: rows.map((row): SearchResultDto => {
        const parsed = this.snippetBuilder.parseHeadline(row.raw_snippet);
        const highlights =
          parsed.highlights.length > 0 || !query
            ? parsed.highlights
            : koreanFallbackHighlights(parsed.snippet, query);
        return {
          aiAllowed: false,
          author: null,
          authorityId: row.authority_id,
          citation: row.citation,
          clientDisplayName: null,
          contentTruncated: false,
          documentType: 'authority',
          externalRef: row.external_ref,
          highlights,
          matterDisplayCode: null,
          matterDisplayName: null,
          nextVersionId: null,
          permissionBadges: {
            confidentiality: 'standard',
            legalHold: 'no_hold',
            privilege: 'none',
          },
          prevVersionId: null,
          resultKind: 'authority',
          safeLabel: row.title,
          score: Number(row.score),
          snippet: parsed.snippet || row.citation,
          sourceType: row.source_type,
          sourceUrl: row.source_url,
          title: row.title,
          updatedAt: row.updated_at.toISOString(),
          versionStatus: 'public',
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
    confidence: Number(row.confidence),
    confidenceBand: row.confidence_band,
  };
}

function mapSavedSearchRow(row: SavedSearchDbRow): SavedSearchDto {
  return {
    canRevoke: row.can_revoke === true,
    createdAt: row.created_at.toISOString(),
    lastOpenedAt: row.last_opened_at ? row.last_opened_at.toISOString() : null,
    name: row.name,
    openCount: Number(row.opened_count ?? 0),
    query: searchQuerySchema.parse(row.search_query_json),
    savedSearchId: row.saved_search_id,
    scope: parseSavedSearchScope(row.scope_type),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseMatterSuggestionReasonCodes(
  input: string[] | null,
): MatterSuggestionDto['reasonCodes'] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value) => {
    if (
      value === 'subject_hash' ||
      value === 'participant_domain_hash' ||
      value === 'conversation_hash'
    ) {
      return [value];
    }
    return [];
  });
}

const emptyFacets: SearchFacetsDto = {
  clients: [],
  confidentialityLevels: [],
  matters: [],
  documentTypes: [],
  extractionStatuses: [],
  emailRecipientDomains: [],
  emailSenderDomains: [],
  ocrConfidence: [],
  legalHolds: [],
  privilegeStatuses: [],
  recordsStatuses: [],
  versionStatuses: [],
  dateRanges: [],
};

function emptySearchResponse(): SearchResponseDto {
  return { facets: emptyFacets, results: [], total: 0 };
}

function parseFacets(input: unknown): SearchFacetsDto {
  if (!isRecord(input)) return emptyFacets;
  return {
    clients: parseBuckets(input.clients),
    confidentialityLevels: parseBuckets(input.confidentialityLevels),
    matters: parseBuckets(input.matters),
    documentTypes: parseBuckets(input.documentTypes),
    extractionStatuses: parseBuckets(input.extractionStatuses),
    emailRecipientDomains: parseBuckets(input.emailRecipientDomains),
    emailSenderDomains: parseBuckets(input.emailSenderDomains),
    ocrConfidence: parseBuckets(input.ocrConfidence),
    legalHolds: parseBuckets(input.legalHolds),
    privilegeStatuses: parseBuckets(input.privilegeStatuses),
    recordsStatuses: parseBuckets(input.recordsStatuses),
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
    return [
      {
        value: item.value,
        count,
        ...(typeof item.label === 'string' ? { label: item.label } : {}),
        ...(typeof item.canViewSensitiveRef === 'boolean'
          ? { canViewSensitiveRef: item.canViewSensitiveRef }
          : {}),
      },
    ];
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

function parseExtractionStatus(
  value: string | null,
): NonNullable<SearchResultDto['extractionStatus']> | null {
  if (value === 'pending' || value === 'ready' || value === 'ocr_pending' || value === 'failed') {
    return value;
  }
  return null;
}

function parseConfidentialityLevel(
  value: string | null,
): SearchResultDto['permissionBadges']['confidentiality'] {
  if (value === 'high' || value === 'restricted') return value;
  return 'standard';
}

function parseLegalHold(value: string | null): SearchResultDto['permissionBadges']['legalHold'] {
  if (value === 'document_hold' || value === 'matter_hold') return value;
  return 'no_hold';
}

function parsePrivilegeStatus(
  value: string | null,
): SearchResultDto['permissionBadges']['privilege'] {
  if (value === 'privileged' || value === 'work_product' || value === 'joint_privilege') {
    return value;
  }
  return 'none';
}
