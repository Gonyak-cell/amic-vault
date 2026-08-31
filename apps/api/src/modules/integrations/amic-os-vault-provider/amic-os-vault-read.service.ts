import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { SearchQueryDto, SearchResultDto } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { SearchService } from '../../search/search.service';
import { TenantContextService } from '../../tenant/tenant-context';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

export interface AmicOsVaultReadInput {
  accountLedgerId: string;
  lawosMatterId: string | null;
  page: number;
  pageSize: number;
  query: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

interface ExactProjectionRow {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  size_bytes: string;
  mime_type: string;
  normalized_filename: string;
  lawos_matter_id: string | null;
}

export interface AmicOsVaultExactProjection {
  document_id: string;
  matter_id: string;
  title: string;
  current_version_id: string;
  version_id: string;
  current_file_object_id: string;
  file_object_id: string;
  latest_sha256: string;
  content_sha256: string;
  current_byte_size: number;
  byte_size: number;
  current_mime_type: string;
  mime_type: string;
  filename: string;
  indexed_at: string | null;
  match_fields: string[];
}

export interface AmicOsVaultReadResponse {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  items: AmicOsVaultExactProjection[];
  page_info: {
    page: number;
    page_size: number;
    returned_count: number;
    current_version_only: true;
    omitted_result_count: null;
  };
  count_leak_prevented: true;
  raw_bytes_included: false;
  storage_locator_returned: false;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function lawosMatterId(row: ExactProjectionRow): string | null {
  const value = row.lawos_matter_id?.trim();
  return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value) ? value : null;
}

@Injectable()
export class AmicOsVaultReadService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
  ) {}

  async list(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultReadInput,
  ): Promise<AmicOsVaultReadResponse> {
    return this.read(principal, { ...input, query: null });
  }

  async search(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultReadInput,
  ): Promise<AmicOsVaultReadResponse> {
    return this.read(principal, input);
  }

  private async read(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultReadInput,
  ): Promise<AmicOsVaultReadResponse> {
    this.assertPrincipal(principal, input.accountLedgerId);
    const vaultMatterId = input.lawosMatterId
      ? await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId)
      : null;
    const filters: NonNullable<SearchQueryDto['filters']> = {
      versionStatus: 'current',
      ...(vaultMatterId ? { matterId: vaultMatterId } : {}),
      ...(input.dateFrom ? { dateFrom: `${input.dateFrom}T00:00:00.000Z` } : {}),
      ...(input.dateTo ? { dateTo: `${input.dateTo}T23:59:59.999Z` } : {}),
    };
    const response = await this.searchService.search(
      {
        tenantId: principal.tenantId,
        userId: principal.actorUserId,
        sessionId: null,
      },
      {
        ...(input.query ? { query: input.query } : {}),
        mode: 'keyword',
        target: 'all',
        sortBy: input.query ? 'relevance' : 'updated_desc',
        groupBy: 'none',
        filters,
        page: input.page,
        pageSize: input.pageSize,
      },
    );
    const projected = await this.projectExactVersions(
      principal,
      response.results,
    );
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      items: projected,
      page_info: {
        page: input.page,
        page_size: input.pageSize,
        returned_count: projected.length,
        current_version_only: true,
        omitted_result_count: null,
      },
      count_leak_prevented: true,
      raw_bytes_included: false,
      storage_locator_returned: false,
    };
  }

  private assertPrincipal(
    principal: AmicOsVaultProviderPrincipal,
    accountLedgerId: string,
  ): void {
    const context = this.tenantContext.require();
    if (
      context.source !== 'amic-os-provider'
      || context.tenantId !== principal.tenantId
      || principal.accountLedgerId !== accountLedgerId
    ) {
      throw permissionDenied();
    }
  }

  private async resolveLawosMatter(tenantId: string, value: string): Promise<string> {
    return this.auditService.transaction(tenantId, async (tx) => {
      const result = await tx.query(
        `
          SELECT matter_id
          FROM matters
          WHERE tenant_id = $1::uuid
            AND (
              metadata_json ->> 'lawosMatterId' = $2
              OR metadata_json ->> 'matterAppMatterId' = $2
            )
          ORDER BY matter_id
          LIMIT 2
        `,
        [tenantId, value],
      );
      const rows = result.rows as Array<{ matter_id: string }>;
      if (rows.length !== 1 || !rows[0]) throw permissionDenied();
      return rows[0].matter_id;
    });
  }

  private async projectExactVersions(
    principal: AmicOsVaultProviderPrincipal,
    results: SearchResultDto[],
  ): Promise<AmicOsVaultExactProjection[]> {
    const documentIds = [...new Set(results
      .map((item) => item.documentId)
      .filter((value): value is string => typeof value === 'string'))];
    if (documentIds.length === 0) return [];
    const rows = await this.auditService.transaction(principal.tenantId, (tx: QueryClient) =>
      tx.query(
        `
          SELECT
            d.document_id,
            dv.version_id,
            dv.file_object_id,
            dv.file_hash AS sha256,
            f.size_bytes::text,
            f.mime_type,
            f.normalized_filename,
            coalesce(
              nullif(m.metadata_json ->> 'lawosMatterId', ''),
              nullif(m.metadata_json ->> 'matterAppMatterId', '')
            ) AS lawos_matter_id
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          JOIN file_objects f
            ON f.tenant_id = dv.tenant_id
           AND f.file_object_id = dv.file_object_id
          WHERE d.tenant_id = $1::uuid
            AND d.document_id = ANY($2::uuid[])
            AND d.status <> 'deleted'
          ORDER BY d.document_id
        `,
        [principal.tenantId, documentIds],
      ));
    const exactByDocument = new Map(
      (rows.rows as ExactProjectionRow[])
        .filter((row) => lawosMatterId(row) !== null)
        .map((row) => [row.document_id, row]),
    );
    const emitted = new Set<string>();
    return results.flatMap((item): AmicOsVaultExactProjection[] => {
      if (!item.documentId || !item.versionId || !item.matterId) return [];
      if (emitted.has(item.documentId)) return [];
      const exact = exactByDocument.get(item.documentId);
      const mappedMatterId = exact ? lawosMatterId(exact) : null;
      const size = Number(exact?.size_bytes);
      if (!exact
          || !mappedMatterId
          || exact.version_id !== item.versionId
          || !Number.isSafeInteger(size)
          || size < 1) return [];
      emitted.add(item.documentId);
      return [{
        document_id: item.documentId,
        matter_id: mappedMatterId,
        title: item.title,
        current_version_id: exact.version_id,
        version_id: exact.version_id,
        current_file_object_id: exact.file_object_id,
        file_object_id: exact.file_object_id,
        latest_sha256: exact.sha256,
        content_sha256: exact.sha256,
        current_byte_size: size,
        byte_size: size,
        current_mime_type: exact.mime_type,
        mime_type: exact.mime_type,
        filename: exact.normalized_filename,
        indexed_at: null,
        match_fields: inputMatchFields(item),
      }];
    });
  }
}

function inputMatchFields(item: SearchResultDto): string[] {
  if (item.snippet?.trim()) return ['body_text'];
  return ['title'];
}
