import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import {
  DartApiClient,
  type DartCompanySearchInput,
  type DartFilingsInput,
  type NormalizedDartCompany,
  type NormalizedDartFiling,
} from './dart-api.client';
import {
  LawApiClient,
  type LawSearchInput,
  type NormalizedLawSearchResult,
} from './law-api.client';

export interface LawDataContext {
  tenantId: string;
  userId: string;
  sessionId: string;
}

export interface LawAuthorityDto {
  authorityId: string;
  graphNodeId: string;
  externalRef: string;
  title: string;
  citation: string;
  sourceUrl: string;
  effectiveDate: string | null;
  promulgationDate: string | null;
  ministry: string | null;
}

export interface LawSearchResponseDto {
  status: 'ok' | 'not_configured';
  query: string;
  results: LawAuthorityDto[];
}

export interface DartFilingsResponseDto {
  status: 'ok' | 'not_configured';
  corpCode: string;
  filings: NormalizedDartFiling[];
}

export interface DartCompanySearchResponseDto {
  status: 'ok' | 'not_configured';
  query: string;
  companies: NormalizedDartCompany[];
}

export interface LawAuthorityRefreshOptions {
  limit?: number | undefined;
  staleBefore?: Date | undefined;
}

export interface LawAuthorityRefreshResult {
  selectedCount: number;
  refreshedCount: number;
  skippedCount: number;
  notConfigured: boolean;
}

interface AuthorityUpsertRow {
  authority_id: string;
}

interface StaleAuthorityRow {
  external_ref: string;
  title: string;
}

interface GraphNodeUpsertRow {
  node_id: string;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function boundedText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function boundedRefreshLimit(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value)) return 25;
  return Math.min(Math.max(value, 1), 100);
}

function defaultStaleBefore(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

@Injectable()
export class LawDataService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(LawApiClient) private readonly lawApi: LawApiClient,
    @Inject(DartApiClient) private readonly dartApi: DartApiClient,
  ) {}

  async searchLaws(ctx: LawDataContext, input: LawSearchInput): Promise<LawSearchResponseDto> {
    if (!this.lawApi.isConfigured()) {
      return { status: 'not_configured', query: input.query, results: [] };
    }
    const laws = await this.lawApi.searchLaws(input);
    const results = await this.auditService.transaction(ctx.tenantId, async (tx) => {
      const rows: LawAuthorityDto[] = [];
      for (const law of laws) {
        rows.push(await this.upsertAuthority(tx, ctx.tenantId, law));
      }
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'GRAPH_SYNCED',
          targetType: 'external_authority',
          targetId: null,
          metadata: {
            source: 'law.go.kr',
            query_hash: sha256Hex(input.query),
            result_count: rows.length,
          },
        },
        tx,
      );
      return rows;
    });
    return { status: 'ok', query: input.query, results };
  }

  async listDartFilings(
    ctx: LawDataContext,
    input: DartFilingsInput,
  ): Promise<DartFilingsResponseDto> {
    if (!this.dartApi.isConfigured()) {
      return { status: 'not_configured', corpCode: input.corpCode, filings: [] };
    }
    const filings = await this.dartApi.listFilings(input);
    await this.auditService.transaction(ctx.tenantId, async (tx) => {
      await tx.query(
        `
          INSERT INTO law_data_dart_filing_cache (
            tenant_id,
            cache_key,
            corp_code,
            filings_json,
            fetched_at
          )
          VALUES ($1, $2, $3, $4::jsonb, now())
          ON CONFLICT (tenant_id, cache_key)
          DO UPDATE SET
            corp_code = EXCLUDED.corp_code,
            filings_json = EXCLUDED.filings_json,
            fetched_at = EXCLUDED.fetched_at
        `,
        [
          ctx.tenantId,
          sha256Hex(
            `${input.corpCode}:${input.beginDate ?? ''}:${input.endDate ?? ''}:${input.pageNo ?? 1}:${
              input.pageCount ?? 10
            }`,
          ),
          input.corpCode,
          JSON.stringify(filings),
        ],
      );
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'SEARCH_EXECUTED',
          targetType: 'external_authority',
          targetId: null,
          metadata: {
            provider_key: 'opendart',
            query_hash: sha256Hex(
              `${input.corpCode}:${input.beginDate ?? ''}:${input.endDate ?? ''}:${input.pageNo ?? 1}:${
                input.pageCount ?? 10
              }`,
            ),
            result_count: filings.length,
            scope_type: 'dart_filings',
            scope_id: input.corpCode,
          },
        },
        tx,
      );
    });
    return { status: 'ok', corpCode: input.corpCode, filings };
  }

  async searchDartCompanies(
    ctx: LawDataContext,
    input: DartCompanySearchInput,
  ): Promise<DartCompanySearchResponseDto> {
    if (!this.dartApi.isConfigured()) {
      return { status: 'not_configured', query: input.query, companies: [] };
    }
    const companies = await this.dartApi.searchCompanies(input);
    await this.auditService.transaction(ctx.tenantId, async (tx) => {
      await this.auditService.log(
        {
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          sessionId: ctx.sessionId,
          action: 'SEARCH_EXECUTED',
          targetType: 'external_authority',
          targetId: null,
          metadata: {
            provider_key: 'opendart',
            query_hash: sha256Hex(input.query),
            result_count: companies.length,
            scope_type: 'dart_company_search',
          },
        },
        tx,
      );
    });
    return { status: 'ok', query: input.query, companies };
  }

  async refreshStaleLawAuthoritiesForTenant(
    tenantId: string,
    options: LawAuthorityRefreshOptions = {},
  ): Promise<LawAuthorityRefreshResult> {
    if (!this.lawApi.isConfigured()) {
      return { selectedCount: 0, refreshedCount: 0, skippedCount: 0, notConfigured: true };
    }
    const staleAuthorities = await this.listStaleLawAuthorities(tenantId, options);
    const refreshes: NormalizedLawSearchResult[] = [];
    let skippedCount = 0;

    for (const authority of staleAuthorities) {
      const laws = await this.lawApi.searchLaws({ query: authority.title, display: 5, page: 1 });
      const refreshed =
        laws.find((law) => law.externalRef === authority.external_ref) ??
        laws.find((law) => law.title === authority.title);
      if (refreshed) refreshes.push(refreshed);
      else skippedCount += 1;
    }

    await this.auditService.transaction(tenantId, async (tx) => {
      for (const law of refreshes) {
        await this.upsertAuthority(tx, tenantId, law);
      }
      await this.auditService.log(
        {
          tenantId,
          actorType: 'system',
          actorId: null,
          action: 'GRAPH_SYNCED',
          targetType: 'external_authority',
          targetId: null,
          metadata: {
            provider_key: 'law.go.kr',
            batch_size: staleAuthorities.length,
            result_count: refreshes.length,
            stale_count: skippedCount,
            scope_type: 'law_amendment_refresh',
          },
        },
        tx,
      );
    });

    return {
      selectedCount: staleAuthorities.length,
      refreshedCount: refreshes.length,
      skippedCount,
      notConfigured: false,
    };
  }

  private async upsertAuthority(
    tx: QueryClient,
    tenantId: string,
    law: NormalizedLawSearchResult,
  ): Promise<LawAuthorityDto> {
    const sourceHash = sha256Hex(stableJson(law.payload));
    const authority = await tx.query(
      `
        INSERT INTO external_authorities (
          tenant_id,
          source_type,
          external_ref,
          title,
          citation,
          source_url,
          search_text,
          payload_json,
          fetched_at
        )
        VALUES ($1, 'law_statute', $2, $3, $4, $5, $6, $7::jsonb, now())
        ON CONFLICT (tenant_id, source_type, external_ref)
        DO UPDATE SET
          title = EXCLUDED.title,
          citation = EXCLUDED.citation,
          source_url = EXCLUDED.source_url,
          search_text = EXCLUDED.search_text,
          payload_json = EXCLUDED.payload_json,
          fetched_at = EXCLUDED.fetched_at,
          updated_at = now()
        RETURNING authority_id
      `,
      [
        tenantId,
        boundedText(law.externalRef, 200),
        boundedText(law.title, 500),
        boundedText(law.citation, 500),
        boundedText(law.sourceUrl, 1000),
        boundedText([law.title, law.citation, law.ministry ?? ''].filter(Boolean).join(' '), 4000),
        JSON.stringify({
          ...law.payload,
          effectiveDate: law.effectiveDate,
          promulgationDate: law.promulgationDate,
          ministry: law.ministry,
        }),
      ],
    );
    const authorityRow = authority.rows[0] as AuthorityUpsertRow | undefined;
    const authorityId = authorityRow?.authority_id;
    if (!authorityId) throw new Error('external authority upsert returned no row');

    const node = await tx.query(
      `
        INSERT INTO graph_nodes (
          tenant_id,
          node_type,
          source_table,
          source_id,
          source_hash,
          stale,
          synced_at,
          provenance,
          review_status,
          created_by_kind,
          updated_at
        )
        VALUES ($1, 'authority', 'external_authorities', $2, $3, false, now(), 'derived', 'confirmed', 'system', now())
        ON CONFLICT (tenant_id, node_type, source_id)
        DO UPDATE SET
          source_hash = EXCLUDED.source_hash,
          stale = false,
          synced_at = now(),
          provenance = 'derived',
          review_status = 'confirmed',
          created_by_kind = 'system',
          updated_at = now()
        RETURNING node_id
      `,
      [tenantId, authorityId, sourceHash],
    );
    const nodeRow = node.rows[0] as GraphNodeUpsertRow | undefined;
    const graphNodeId = nodeRow?.node_id;
    if (!graphNodeId) throw new Error('authority graph node upsert returned no row');

    return {
      authorityId,
      graphNodeId,
      externalRef: law.externalRef,
      title: law.title,
      citation: law.citation,
      sourceUrl: law.sourceUrl,
      effectiveDate: law.effectiveDate,
      promulgationDate: law.promulgationDate,
      ministry: law.ministry,
    };
  }

  private async listStaleLawAuthorities(
    tenantId: string,
    options: LawAuthorityRefreshOptions,
  ): Promise<StaleAuthorityRow[]> {
    const result = await this.auditService.transaction(tenantId, async (tx) =>
      tx.query(
        `
          SELECT external_ref, title
          FROM external_authorities
          WHERE tenant_id = $1
            AND source_type = 'law_statute'
            AND fetched_at <= $2
          ORDER BY fetched_at ASC, authority_id ASC
          LIMIT $3
        `,
        [tenantId, options.staleBefore ?? defaultStaleBefore(), boundedRefreshLimit(options.limit)],
      ),
    );
    return result.rows as StaleAuthorityRow[];
  }
}
