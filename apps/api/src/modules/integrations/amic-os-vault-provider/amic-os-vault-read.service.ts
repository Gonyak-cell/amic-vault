import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { SearchQueryDto, SearchResultDto, TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { SearchService } from '../../search/search.service';
import { ExternalService } from '../../external/external.service';
import { DocumentVersionService } from '../../document/document-version.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { PreviewPrecreateQueueService } from '../../preview/preview-precreate-queue.service';
import {
  PreviewSessionService,
  type PreviewExactVersion,
  type PreviewSessionTarget,
} from '../../preview/preview-session.service';
import { PREVIEW_CHUNK_BYTES, PreviewService, type PreviewArtifactRow } from '../../preview/preview.service';
import {
  AmicOsVaultProviderConfig,
  type AmicOsVaultProviderPrincipal,
} from './amic-os-vault-provider.guard';

const portalDocumentMimeTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/rtf',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

export interface AmicOsVaultReadInput {
  accountLedgerId: string;
  lawosMatterId: string | null;
  page: number;
  pageSize: number;
  query: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface AmicOsVaultVersionReadInput {
  accountLedgerId: string;
  lawosMatterId: string;
  documentId: string;
  page: number;
  pageSize: number;
}

export interface AmicOsVaultVersionProjection {
  document_id: string;
  matter_id: string;
  version_id: string;
  version_no: number;
  version_status: 'current' | 'superseded';
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
  created_at: string;
  version_label: string | null;
  version_significance: string;
  rendition_type: string;
  supersedes_version_id: string | null;
}

export interface AmicOsVaultVersionReadResponse {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  items: AmicOsVaultVersionProjection[];
  page_info: {
    page: number;
    page_size: number;
    returned_count: number;
    has_more: boolean;
  };
  count_leak_prevented: true;
  raw_bytes_included: false;
  storage_locator_returned: false;
}

export interface AmicOsVaultPreviewInput {
  accountLedgerId: string;
  lawosMatterId: string;
  exact: PreviewExactVersion;
}

export interface AmicOsVaultPreviewFile {
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: 'application/pdf';
}

export interface AmicOsVaultPreviewChunkInput extends AmicOsVaultPreviewInput {
  previewSessionId: string;
  token: string;
  preview: AmicOsVaultPreviewFile;
  offset: number;
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

interface VersionFileRow {
  file_object_id: string;
  size_bytes: string;
  mime_type: string;
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

function previewUnavailable(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', reason: 'PREVIEW_CONVERSION_UNAVAILABLE' });
}

function previewFile(file: PreviewArtifactRow): AmicOsVaultPreviewFile {
  const size = Number(file.size_bytes);
  if (file.mime_type !== 'application/pdf' || !Number.isSafeInteger(size) || size < 1
      || !/^[a-f0-9]{64}$/u.test(file.sha256)) throw previewUnavailable();
  return { file_object_id: file.file_object_id, sha256: file.sha256, byte_size: size, mime_type: 'application/pdf' };
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
    @Inject(PreviewSessionService) private readonly previewSessions: PreviewSessionService,
    @Inject(PreviewService) private readonly previews: PreviewService,
    @Inject(PreviewPrecreateQueueService) private readonly previewQueue: PreviewPrecreateQueueService,
    @Inject(ExternalService) private readonly external: ExternalService,
    @Inject(DocumentVersionService) private readonly documentVersions: DocumentVersionService,
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

  async versions(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultVersionReadInput,
  ): Promise<AmicOsVaultVersionReadResponse> {
    this.assertPrincipal(principal, input.accountLedgerId);
    const matterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
    const target = await this.documentVersions.findVersionTarget(principal.tenantId as TenantId, input.documentId);
    if (!target || target.matter_id !== matterId) throw permissionDenied();

    const versions = await this.documentVersions.listVersions(
      principal.actorUserId,
      input.documentId,
      {},
    );
    const offset = (input.page - 1) * input.pageSize;
    const pageItems = versions.items.slice(offset, offset + input.pageSize);
    const fileIds = pageItems.map((item) => item.fileObjectId);
    const files = fileIds.length === 0
      ? []
      : (await this.auditService.transaction(principal.tenantId, (tx: QueryClient) => tx.query(
          `SELECT file_object_id, size_bytes::text, mime_type
           FROM file_objects
           WHERE tenant_id = $1::uuid AND file_object_id = ANY($2::uuid[])`,
          [principal.tenantId, fileIds],
        ))).rows as VersionFileRow[];
    const fileById = new Map(files.map((file) => [file.file_object_id, file]));
    const items = pageItems.map((version): AmicOsVaultVersionProjection => {
      const file = fileById.get(version.fileObjectId);
      const size = Number(file?.size_bytes);
      if (!file || !Number.isSafeInteger(size) || size < 1) throw permissionDenied();
      return {
        document_id: version.documentId,
        matter_id: input.lawosMatterId,
        version_id: version.versionId,
        version_no: version.versionNo,
        version_status: version.versionStatus,
        file_object_id: version.fileObjectId,
        sha256: version.fileHash,
        byte_size: size,
        mime_type: file.mime_type,
        created_at: version.createdAt,
        version_label: version.versionLabel,
        version_significance: version.versionSignificance,
        rendition_type: version.renditionType,
        supersedes_version_id: version.supersedesVersionId,
      };
    });
    return {
      authority_kind: 'amic-vault-api',
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      items,
      page_info: {
        page: input.page,
        page_size: input.pageSize,
        returned_count: items.length,
        has_more: offset + items.length < versions.items.length,
      },
      count_leak_prevented: true,
      raw_bytes_included: false,
      storage_locator_returned: false,
    };
  }

  async portalDocument(principal: AmicOsVaultProviderPrincipal, input: {
    accountLedgerId: string; lawosMatterId: string; documentId: string;
  }) {
    this.assertPrincipal(principal, input.accountLedgerId);
    const matterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
    const authorization = await this.external.authorizePortalDocument(
      { tenantId: principal.tenantId, userId: principal.actorUserId }, matterId, input.documentId,
    );
    const result = await this.auditService.transaction(principal.tenantId, tx => tx.query(
      `SELECT v.document_id, v.version_id, v.file_object_id, v.file_hash AS sha256,
              f.size_bytes::text, f.mime_type
       FROM document_versions v
       JOIN file_objects f ON f.tenant_id = v.tenant_id AND f.file_object_id = v.file_object_id
       WHERE v.tenant_id = $1::uuid AND v.document_id = $2::uuid
         AND v.version_id = $3::uuid AND v.version_status = 'current'`,
      [principal.tenantId, input.documentId, authorization.versionId],
    ));
    const row = result.rows[0] as ExactProjectionRow | undefined;
    const size = Number(row?.size_bytes);
    if (result.rows.length !== 1 || !row || row.document_id !== input.documentId
        || row.version_id !== authorization.versionId || !Number.isSafeInteger(size) || size < 1
        || size > 256 * 1024 * 1024 || !portalDocumentMimeTypes.has(row.mime_type)
        || !/^[a-f0-9]{64}$/u.test(row.sha256)) throw permissionDenied();
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(), provider_revision: this.config.uploadProviderRevision(),
      exact_version: { document_id: row.document_id, version_id: row.version_id, file_object_id: row.file_object_id,
        sha256: row.sha256, byte_size: size, mime_type: row.mime_type },
      policy_ref: authorization.policyRef,
    };
  }

  async preparePreview(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultPreviewInput,
    enqueue: boolean,
  ) {
    const original = await this.previewTarget(principal, input);
    const { tenantId } = this.tenantContext.require();
    const prepared = await this.previews.getPreparedPreview(tenantId, original);
    if (prepared.status === 'ready') {
      return { ...this.previewAuthority(input), status: 'ready' as const, preview: previewFile(prepared.file) };
    }
    if (enqueue) {
      await this.auditService.transaction(principal.tenantId, async (tx) => {
        await this.previewQueue.enqueueVersionCreated({
          tenantId,
          actorUserId: principal.actorUserId,
          documentId: original.document_id,
          versionId: original.version_id,
          fileObjectId: original.file_object_id,
        }, tx, true);
        await tx.query(
          `INSERT INTO document_preview_artifacts (
             tenant_id, document_id, version_id, file_object_id, status, failure_reason_code,
             source_sha256, converter_profile_sha256
           ) VALUES ($1, $2, $3, $4, 'pending', NULL, $5, $6)
           ON CONFLICT (tenant_id, version_id) DO UPDATE
             SET status = 'pending', failure_reason_code = NULL, updated_at = now(),
               source_sha256 = EXCLUDED.source_sha256,
               converter_profile_sha256 = EXCLUDED.converter_profile_sha256
           WHERE document_preview_artifacts.status = 'failed'
             OR document_preview_artifacts.source_sha256 IS DISTINCT FROM EXCLUDED.source_sha256
             OR document_preview_artifacts.converter_profile_sha256 IS DISTINCT FROM EXCLUDED.converter_profile_sha256`,
          [principal.tenantId, original.document_id, original.version_id, original.file_object_id,
            original.sha256, prepared.converterProfileSha256],
        );
      });
    }
    return { ...this.previewAuthority(input), status: enqueue ? 'pending' as const : prepared.status, preview: null };
  }

  async issuePreviewSession(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultPreviewInput,
  ) {
    const original = await this.previewTarget(principal, input);
    const prepared = await this.previews.getPreparedPreview(this.tenantContext.require().tenantId, original);
    if (prepared.status !== 'ready') throw previewUnavailable();
    const file = previewFile(prepared.file);
    const session = await this.previewSessions.issue(principal.actorUserId, original.document_id, input.exact);
    return { ...this.previewAuthority(input), status: 'ready' as const, preview: file, session, chunk_bytes: PREVIEW_CHUNK_BYTES };
  }

  async previewChunk(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultPreviewChunkInput,
  ) {
    const original = await this.previewTarget(principal, input);
    const { tenantId } = this.tenantContext.require();
    const prepared = await this.previews.getPreparedPreview(tenantId, original);
    if (prepared.status !== 'ready') throw previewUnavailable();
    const file = previewFile(prepared.file);
    if (file.file_object_id !== input.preview.file_object_id || file.sha256 !== input.preview.sha256
        || file.byte_size !== input.preview.byte_size || file.mime_type !== input.preview.mime_type) {
      throw permissionDenied();
    }
    const bytes = await this.previews.readPreparedChunk(tenantId, prepared.file, input.offset);
    // A slow storage read must not release bytes after a version, permission or session change.
    await this.previewTarget(principal, input);
    return {
      ...this.previewAuthority(input),
      preview: file,
      preview_session_id: input.previewSessionId,
      chunk: {
        offset: input.offset,
        byte_size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        content_base64: bytes.toString('base64'),
      },
      next_offset: input.offset + bytes.byteLength,
      final_chunk: input.offset + bytes.byteLength === file.byte_size,
    };
  }

  private previewAuthority(input: AmicOsVaultPreviewInput) {
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      exact_version: input.exact,
    };
  }

  private async previewTarget(
    principal: AmicOsVaultProviderPrincipal,
    input: AmicOsVaultPreviewInput | AmicOsVaultPreviewChunkInput,
  ): Promise<PreviewSessionTarget> {
    this.assertPrincipal(principal, input.accountLedgerId);
    const vaultMatterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
    const original = 'previewSessionId' in input
      ? await this.previewSessions.authorizeStream(
        principal.actorUserId, input.exact.document_id, input.previewSessionId, input.token, input.exact,
      )
      : await this.previewSessions.inspect(principal.actorUserId, input.exact.document_id, input.exact);
    if (original.matter_id !== vaultMatterId) throw permissionDenied();
    return original;
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
            AND NOT EXISTS (
              SELECT 1
              FROM amic_os_office_copies copy
              WHERE copy.tenant_id = d.tenant_id
                AND copy.working_document_id = d.document_id
                AND copy.state <> 'saved'
            )
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
