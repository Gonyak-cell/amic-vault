import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  SearchDateBasis,
  SearchQueryDto,
  SearchResultDto,
  SearchSort,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../../audit/audit.service';
import { SearchService } from '../../search/search.service';
import { ExternalService } from '../../external/external.service';
import { DocumentVersionService } from '../../document/document-version.service';
import { DocumentFolderService } from '../../document/document-folder.service';
import { PermissionService } from '../../permission/permission.service';
import { TenantContextService } from '../../tenant/tenant-context';
import { StorageService } from '../../storage/storage.service';
import { decodeEmlRawContent, normalizeEmailMetadata } from '@amic-vault/shared';
import { PreviewPrecreateQueueService } from '../../preview/preview-precreate-queue.service';
import {
  PreviewSessionService,
  type PreviewExactVersion,
  type PreviewSessionTarget,
} from '../../preview/preview-session.service';
import { PREVIEW_CHUNK_BYTES, PreviewService, type PreviewArtifactRow } from '../../preview/preview.service';
import { promotedDocumentExistsSql } from '../../file-security/promoted-file.guard';
import {
  AMIC_OS_VAULT_MAX_EXPORT_BYTES,
  type AmicOsVaultExactVersion,
} from './amic-os-vault-provider.contract';
import { AMIC_OS_VAULT_MAX_UPLOAD_BYTES } from './amic-os-vault-upload.contract';
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
const vaultMimeTypePattern = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u;
const providerEmailScanPageSize = 50;
// SearchService caps the *reported total*, while SQL pages use LIMIT/OFFSET.
// Collect complete scoped pages before applying the email timestamp sort.
const providerEmailScanPageLimit = 1_000;
const providerEmailHeaderBytes = 4 * 1024 * 1024;
const providerEmailHeaderReadConcurrency = 16;

type EmailTimeField = 'event_at' | 'sent_at' | 'received_at' | 'filed_at';
type EmailDirection = 'sent' | 'received';

interface ProviderEmailCriteria {
  dateBasis: EmailTimeField;
  sort: EmailTimeField;
  sortOrder: 'asc' | 'desc';
  direction: EmailDirection | null;
}

interface SearchQueryWithEmailCriteria extends SearchQueryDto {
  emailCriteria?: ProviderEmailCriteria;
}

export interface AmicOsVaultReadInput {
  accountLedgerId: string;
  lawosMatterId: string | null;
  folderId?: string | null;
  page: number;
  pageSize: number;
  query: string | null;
  bodyQuery?: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  dateBasis?: SearchDateBasis;
  mimeTypes?: readonly string[] | null;
  matterCode?: string | null;
  matterName?: string | null;
  clientCode?: string | null;
  clientName?: string | null;
  tags?: readonly string[] | null;
  sortBy?: SearchSort | null;
  emailDateBasis?: EmailTimeField | null;
  emailSort?: EmailTimeField | null;
  emailSortOrder?: 'asc' | 'desc' | null;
  emailDirection?: EmailDirection | null;
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

export interface AmicOsVaultLatestVersionProjection {
  document_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  byte_size: number;
  mime_type: string;
}

export interface AmicOsVaultLatestReadResponse {
  authority_kind: 'amic-vault-api';
  authority_ref: string;
  provider_revision: string;
  matter_id: string;
  exact_version: AmicOsVaultLatestVersionProjection;
  email_source?: AmicOsVaultEmailSourceProjection;
  policy_ref: string;
  raw_bytes_included: false;
  storage_locator_returned: false;
  history_included: false;
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
  matter_id: string;
  version_id: string;
  file_object_id: string;
  sha256: string;
  size_bytes: string;
  mime_type: string;
  normalized_filename: string;
  lawos_matter_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  creator_name: string | null;
  canonical_matter_code: string | null;
  canonical_matter_name: string | null;
  canonical_client_id: string | null;
  canonical_client_name: string | null;
  email_id?: string | null;
  email_subject?: string | null;
  email_sent_at?: Date | string | null;
  email_received_at?: Date | string | null;
  email_filed_at?: Date | string | null;
  email_storage_uri?: string | null;
  email_raw_file_object_id?: string | null;
  email_raw_sha256?: string | null;
  email_raw_size_bytes?: string | null;
  email_raw_mime_type?: string | null;
  email_raw_filename?: string | null;
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
  matter_code: string | null;
  matter_name: string | null;
  client_id: string | null;
  client_name: string | null;
  client_display_name: string | null;
  metadata_code: null;
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
  created_at: string;
  edited_at: string;
  author_name: string | null;
  creator_name: string | null;
  indexed_at: string | null;
  match_fields: string[];
  email_message?: AmicOsVaultEmailMessageProjection;
  email_source?: AmicOsVaultEmailSourceProjection;
}

export interface AmicOsVaultEmailMessageProjection {
  subject: string | null;
  from: string | null;
  to: string[];
  direction?: EmailDirection | null;
  sent_at?: string | null;
  received_at?: string | null;
  filed_at?: string | null;
  event_at?: string | null;
}

export interface AmicOsVaultEmailSourceProjection {
  source_kind: 'filed_eml';
  exact_version: AmicOsVaultExactVersion;
  attachment_name: string;
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
    email_date_basis?: EmailTimeField;
    email_sort?: EmailTimeField;
    email_sort_order?: 'asc' | 'desc';
    email_direction?: EmailDirection | null;
  };
  count_leak_prevented: true;
  raw_bytes_included: false;
  storage_locator_returned: false;
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && error.code === '40001';
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

function safeExternalId(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(normalized) ? normalized : null;
}

function canonicalInstant(value: Date | string): string | null {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function displayText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.normalize('NFC').trim() ?? '';
  if (!normalized || normalized.length > maximum) return null;
  for (const character of normalized) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return null;
  }
  return normalized;
}

function emailSourceForRow(row: ExactProjectionRow): AmicOsVaultEmailSourceProjection | null {
  const rawFileObjectId = row.email_raw_file_object_id?.trim() ?? '';
  const rawSha256 = row.email_raw_sha256?.trim().toLowerCase() ?? '';
  const rawMimeType = row.email_raw_mime_type?.trim().toLowerCase() ?? '';
  const attachmentName = displayText(row.email_raw_filename, 240);
  const byteSize = Number(row.email_raw_size_bytes);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(rawFileObjectId)
      || !/^[a-f0-9]{64}$/u.test(rawSha256)
      || rawMimeType !== 'message/rfc822'
      || !attachmentName
      || !Number.isSafeInteger(byteSize)
      || byteSize < 1
      || byteSize > AMIC_OS_VAULT_MAX_EXPORT_BYTES) return null;
  return {
    source_kind: 'filed_eml',
    exact_version: {
      // The DMS body document/version is the ACL and current-version anchor;
      // file_object_id/hash/size/mime identify the immutable filed EML object.
      document_id: row.document_id,
      version_id: row.version_id,
      file_object_id: rawFileObjectId,
      sha256: rawSha256,
      byte_size: byteSize,
      mime_type: 'message/rfc822',
    },
    attachment_name: attachmentName,
  };
}

function emailCriteria(input: AmicOsVaultReadInput): ProviderEmailCriteria | null {
  const active = [input.emailDateBasis, input.emailSort, input.emailSortOrder, input.emailDirection]
    .some((value) => value !== undefined && value !== null);
  if (!active) return null;
  return {
    dateBasis: input.emailDateBasis ?? 'event_at',
    sort: input.emailSort ?? 'event_at',
    sortOrder: input.emailSortOrder ?? 'desc',
    direction: input.emailDirection ?? null,
  };
}

function emailEventAt(message: AmicOsVaultEmailMessageProjection, field: EmailTimeField): string | null {
  const value = message[field];
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function emailDirectionFor(row: ExactProjectionRow): EmailDirection | null {
  // The provider schema does not persist a folder direction. A non-null
  // received timestamp is the durable inbound signal; absent that, a sent
  // timestamp denotes the sent copy. Rows with neither timestamp remain null
  // and therefore fail a direction filter closed instead of being guessed.
  if (row.email_received_at) return 'received';
  if (row.email_sent_at) return 'sent';
  return null;
}

function emailSortTime(message: AmicOsVaultEmailMessageProjection, field: EmailTimeField): number {
  const parsed = Date.parse(emailEventAt(message, field) ?? '');
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function orderEmailResults(
  items: readonly AmicOsVaultExactProjection[],
  criteria: ProviderEmailCriteria,
): AmicOsVaultExactProjection[] {
  return [...items].sort((left, right) => {
    const leftMessage = left.email_message;
    const rightMessage = right.email_message;
    const leftAt = leftMessage ? emailSortTime(leftMessage, criteria.sort) : Number.NaN;
    const rightAt = rightMessage ? emailSortTime(rightMessage, criteria.sort) : Number.NaN;
    const leftValid = Number.isFinite(leftAt);
    const rightValid = Number.isFinite(rightAt);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (leftValid && rightValid && leftAt !== rightAt) {
      return criteria.sortOrder === 'asc' ? leftAt - rightAt : rightAt - leftAt;
    }
    return left.document_id.localeCompare(right.document_id);
  });
}

function withinEmailDateRange(
  message: AmicOsVaultEmailMessageProjection,
  input: AmicOsVaultReadInput,
  criteria: ProviderEmailCriteria,
): boolean {
  const value = emailEventAt(message, criteria.dateBasis);
  if (!value) return !input.dateFrom && !input.dateTo;
  const instant = Date.parse(value);
  // AMIC OS treats calendar bounds as Seoul dates. Keep the provider's
  // timestamp comparison aligned with that contract instead of interpreting
  // a date-only value in the host process timezone.
  const from = input.dateFrom ? Date.parse(`${input.dateFrom}T00:00:00.000+09:00`) : Number.NEGATIVE_INFINITY;
  const to = input.dateTo ? Date.parse(`${input.dateTo}T23:59:59.999+09:00`) : Number.POSITIVE_INFINITY;
  return instant >= from && instant <= to;
}

function emailMatchFields(
  item: SearchResultDto,
  message: AmicOsVaultEmailMessageProjection | undefined,
  query: string | null,
): string[] {
  if (!message || !query?.trim()) return inputMatchFields(item);
  const needle = query.normalize('NFC').trim().toLocaleLowerCase();
  const fields: string[] = [];
  if (message.subject?.toLocaleLowerCase().includes(needle)) fields.push('email_subject');
  if (message.from?.toLocaleLowerCase().includes(needle)) fields.push('email_from');
  if (message.to.some((address) => address.toLocaleLowerCase().includes(needle))) fields.push('email_to');
  return fields.length > 0 ? fields : inputMatchFields(item);
}

function completeEmailAddressQuery(query: string | null): boolean {
  return /^[^\s@<>;,]+@[a-z0-9.-]+$/iu.test(query?.trim() ?? '');
}

function emailHeaderMatchesQuery(
  message: AmicOsVaultEmailMessageProjection,
  query: string | null,
): boolean {
  if (!query?.trim()) return true;
  const needle = query.normalize('NFC').trim().toLocaleLowerCase();
  const addressQuery = completeEmailAddressQuery(needle);
  if (addressQuery) {
    return message.from?.toLocaleLowerCase() === needle
      || message.to.some((address) => address.toLocaleLowerCase() === needle);
  }
  return Boolean(message.subject?.normalize('NFC').toLocaleLowerCase().includes(needle)
    || message.from?.toLocaleLowerCase().includes(needle)
    || message.to.some((address) => address.toLocaleLowerCase().includes(needle)));
}

async function readEmailHeaderPrefix(body: NodeJS.ReadableStream | Buffer): Promise<string | null> {
  const bytes: Buffer[] = [];
  let length = 0;
  const append = (value: Uint8Array) => {
    if (length >= providerEmailHeaderBytes) return;
    const remaining = providerEmailHeaderBytes - length;
    const chunk = Buffer.from(value.subarray(0, remaining));
    bytes.push(chunk);
    length += chunk.length;
  };
  if (Buffer.isBuffer(body)) {
    append(body);
  } else {
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      append(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      const joined = Buffer.concat(bytes).toString('latin1');
      if (/\r?\n\r?\n/u.test(joined) || length >= providerEmailHeaderBytes) break;
    }
  }
  const raw = Buffer.concat(bytes).toString('latin1');
  const boundary = raw.match(/\r?\n\r?\n/u);
  if (!boundary) return null;
  return raw.slice(0, (boundary.index ?? raw.length) + boundary[0].length);
}

@Injectable()
export class AmicOsVaultReadService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
    @Inject(PreviewSessionService) private readonly previewSessions: PreviewSessionService,
    @Inject(PreviewService) private readonly previews: PreviewService,
    @Inject(PreviewPrecreateQueueService) private readonly previewQueue: PreviewPrecreateQueueService,
    @Inject(ExternalService) private readonly external: ExternalService,
    @Inject(DocumentVersionService) private readonly documentVersions: DocumentVersionService,
    @Inject(DocumentFolderService) private readonly documentFolders: DocumentFolderService,
    @Optional()
    @Inject(StorageService) private readonly storageService?: StorageService,
  ) {}

  async folders(principal: AmicOsVaultProviderPrincipal, input: {
    accountLedgerId: string; lawosMatterId: string;
  }) {
    this.assertPrincipal(principal, input.accountLedgerId);
    const vaultMatterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
    const folders = await this.documentFolders.listFolders(principal.actorUserId, vaultMatterId);
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      items: folders.map((folder) => ({
        folder_id: folder.folderId,
        parent_folder_id: folder.parentFolderId,
        name: folder.name,
        path: folder.path,
      })),
      count_leak_prevented: true as const,
    };
  }

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

  async latest(
    principal: AmicOsVaultProviderPrincipal,
    input: { accountLedgerId: string; lawosMatterId: string; documentId: string },
  ): Promise<AmicOsVaultLatestReadResponse> {
    this.assertPrincipal(principal, input.accountLedgerId);
    try {
      const outcome = await this.auditService.transaction<
        AmicOsVaultLatestReadResponse | ForbiddenException
      >(principal.tenantId, async (tx: QueryClient) => {
        try {
          const matterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
          await this.lockLatestAuthority(tx, principal, matterId, input.documentId);
          const authorization = await this.external.authorizeInternalLatestDocument(
            { tenantId: principal.tenantId, userId: principal.actorUserId }, matterId, input.documentId,
          );
          const result = await tx.query(
            `SELECT d.matter_id, v.document_id, v.version_id, v.file_object_id, v.file_hash AS sha256,
                    f.size_bytes::text, f.mime_type,
                    email_source.raw_file_object_id AS email_raw_file_object_id,
                    email_source.raw_sha256 AS email_raw_sha256,
                    email_source.raw_size_bytes AS email_raw_size_bytes,
                    email_source.raw_mime_type AS email_raw_mime_type,
                    email_source.raw_filename AS email_raw_filename
             FROM documents d
             JOIN document_versions v
               ON v.tenant_id = d.tenant_id AND v.document_id = d.document_id
             JOIN file_objects f
               ON f.tenant_id = v.tenant_id AND f.file_object_id = v.file_object_id
             LEFT JOIN LATERAL (
               SELECT raw_file.file_object_id AS raw_file_object_id,
                      em.raw_sha256,
                      em.raw_size_bytes::text AS raw_size_bytes,
                      raw_file.mime_type AS raw_mime_type,
                      raw_file.normalized_filename AS raw_filename
               FROM email_matter_filings filing
               JOIN email_messages em
                 ON em.tenant_id = filing.tenant_id AND em.email_id = filing.email_id
               JOIN file_objects raw_file
                 ON raw_file.tenant_id = em.tenant_id
                AND raw_file.file_object_id = em.raw_file_object_id
               WHERE filing.tenant_id = d.tenant_id
                 AND filing.matter_id = d.matter_id
                 AND filing.body_document_id = d.document_id
                 AND em.raw_size_bytes = raw_file.size_bytes
                 AND em.raw_sha256 = raw_file.sha256
                 AND lower(raw_file.mime_type) = 'message/rfc822'
               ORDER BY filing.created_at DESC, em.email_id ASC
               LIMIT 1
             ) email_source ON true
             WHERE d.tenant_id = $1::uuid AND d.document_id = $2::uuid
               AND d.matter_id = $3::uuid AND d.status <> 'deleted'
               AND v.version_id = $4::uuid AND v.version_status = 'current'
               AND ${promotedDocumentExistsSql('d', 'v')}`,
            [principal.tenantId, input.documentId, matterId, authorization.versionId],
          );
          const row = result.rows[0] as (ExactProjectionRow & { matter_id: string }) | undefined;
          const size = Number(row?.size_bytes);
          if (result.rows.length !== 1 || !row || row.document_id !== input.documentId
              || row.matter_id !== matterId || row.version_id !== authorization.versionId
              || !Number.isSafeInteger(size) || size < 1 || size > AMIC_OS_VAULT_MAX_UPLOAD_BYTES
              || !vaultMimeTypePattern.test(row.mime_type)
              || !/^[a-f0-9]{64}$/u.test(row.sha256)
              || typeof authorization.policyRef !== 'string'
              || !/^[a-f0-9]{64}$/u.test(authorization.policyRef)) throw permissionDenied();
          const emailSource = emailSourceForRow(row);

          return {
            authority_kind: 'amic-vault-api' as const,
            authority_ref: this.config.uploadAuthorityRef(),
            provider_revision: this.config.uploadProviderRevision(),
            matter_id: input.lawosMatterId,
            exact_version: {
              document_id: row.document_id,
              version_id: row.version_id,
              file_object_id: row.file_object_id,
              sha256: row.sha256,
              byte_size: size,
              mime_type: row.mime_type,
            },
            ...(emailSource ? { email_source: emailSource } : {}),
            policy_ref: authorization.policyRef,
            raw_bytes_included: false,
            storage_locator_returned: false,
            history_included: false,
          };
        } catch (error) {
          // DLP assessment/audit writes are part of the denied decision and must
          // commit before the endpoint releases the fail-closed response.
          if (error instanceof ForbiddenException) return error;
          throw error;
        }
      }, { isolationLevel: 'serializable' });
      if (outcome instanceof ForbiddenException) throw outcome;
      return outcome;
    } catch (error) {
      if (isSerializationFailure(error)) throw permissionDenied();
      throw error;
    }
  }

  private async lockLatestAuthority(
    tx: QueryClient,
    principal: AmicOsVaultProviderPrincipal,
    matterId: string,
    documentId: string,
  ): Promise<void> {
    const result = await tx.query(
      `SELECT app_lock_internal_latest_authority(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid
       ) AS locked`,
      [principal.tenantId, principal.actorUserId, documentId, matterId],
    );
    const row = result.rows[0] as { locked?: boolean } | undefined;
    if (result.rows.length !== 1 || row?.locked !== true) throw permissionDenied();
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
    if (input.folderId) {
      if (!vaultMatterId) throw permissionDenied();
      const folders = await this.documentFolders.listFolders(principal.actorUserId, vaultMatterId);
      if (!folders.some((folder) => folder.folderId === input.folderId)) throw permissionDenied();
    }
    const filters: NonNullable<SearchQueryDto['filters']> = {
      versionStatus: 'current',
      ...(vaultMatterId ? { matterId: vaultMatterId } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.dateFrom ? { dateFrom: `${input.dateFrom}T00:00:00.000Z` } : {}),
      ...(input.dateTo ? { dateTo: `${input.dateTo}T23:59:59.999Z` } : {}),
      ...(input.dateBasis ? { dateBasis: input.dateBasis } : {}),
      ...(input.mimeTypes?.length ? { mimeType: [...input.mimeTypes] } : {}),
      ...(input.matterCode ? { matterCode: input.matterCode } : {}),
      ...(input.matterName ? { matterName: input.matterName } : {}),
      ...(input.clientCode ? { clientCode: input.clientCode } : {}),
      ...(input.clientName ? { clientName: input.clientName } : {}),
      ...(input.tags?.length ? { tags: [...input.tags] } : {}),
    };
    const bodyQuery = input.bodyQuery?.trim() || null;
    const searchQuery = bodyQuery ?? input.query;
    const criteria = emailCriteria(input);
    if (criteria && input.query?.includes('@')
        && !/^[^\s@<>;,]+@[a-z0-9.-]+$/iu.test(input.query.trim())) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', reason: 'EMAIL_ADDRESS_QUERY_REQUIRES_COMPLETE_ADDRESS' });
    }
    const searchContext = {
      tenantId: principal.tenantId,
      userId: principal.actorUserId,
      sessionId: null,
    };
    const searchInput: SearchQueryWithEmailCriteria = {
      ...(searchQuery ? { query: searchQuery } : {}),
      mode: 'keyword',
      target: criteria ? 'email' : bodyQuery ? 'body' : 'all',
      sortBy: criteria ? 'updated_desc' : input.sortBy ?? (searchQuery ? 'relevance' : 'updated_desc'),
      groupBy: 'none',
      filters: criteria
        ? {
            ...filters,
            dateFrom: undefined,
            dateTo: undefined,
            dateBasis: undefined,
            // Imported mail is indexed as a `document_type = 'email'` body
            // document (`text/plain`), while the filed immutable EML remains
            // in email_messages/file_objects. Search the body document here
            // and let projectExactVersions follow body_document_id to the
            // filed EML metadata. The response keeps the body's exact MIME;
            // this bridge never relabels it or exposes raw storage bytes.
            mimeType: undefined,
            documentType: ['email'],
          }
        : filters,
      page: criteria ? 1 : input.page,
      pageSize: criteria ? providerEmailScanPageSize : input.pageSize,
      ...(criteria ? { emailCriteria: criteria } : {}),
    };
    const response = criteria
      ? await this.searchAllEmailCandidates(searchContext, searchInput)
      : await this.searchService.search(searchContext, searchInput);
    const projected: AmicOsVaultExactProjection[] = [];
    // Bound each exact-version read and its header reads to one search page.
    // A tenant may have tens of thousands of permitted email documents.
    for (let offset = 0; offset < response.results.length; offset += providerEmailScanPageSize) {
      projected.push(...await this.projectExactVersions(
        principal,
        response.results.slice(offset, offset + providerEmailScanPageSize),
        criteria,
        searchQuery,
      ));
    }
    const filtered = criteria
      ? orderEmailResults(
          projected.filter((item) => {
            const message = item.email_message;
            if (!message) return false;
            return (!criteria.direction || message.direction === criteria.direction)
              && withinEmailDateRange(message, input, criteria);
          }),
          criteria,
        )
      : projected;
    const pageStart = criteria ? (input.page - 1) * input.pageSize : 0;
    const pageItems = criteria ? filtered.slice(pageStart, pageStart + input.pageSize) : filtered;
    return {
      authority_kind: 'amic-vault-api' as const,
      authority_ref: this.config.uploadAuthorityRef(),
      provider_revision: this.config.uploadProviderRevision(),
      items: pageItems,
      page_info: {
        page: input.page,
        page_size: input.pageSize,
        returned_count: pageItems.length,
        current_version_only: true,
        omitted_result_count: null,
        ...(criteria ? {
          email_date_basis: criteria.dateBasis,
          email_sort: criteria.sort,
          email_sort_order: criteria.sortOrder,
          email_direction: criteria.direction,
        } : {}),
      },
      count_leak_prevented: true,
      raw_bytes_included: false,
      storage_locator_returned: false,
    };
  }

  private async searchAllEmailCandidates(
    context: { tenantId: string; userId: string; sessionId: null },
    input: SearchQueryWithEmailCriteria,
  ): Promise<{ results: SearchResultDto[] }> {
    const results: SearchResultDto[] = [];
    for (let page = 1; page <= providerEmailScanPageLimit; page += 1) {
      const response = await this.searchService.search(context, { ...input, page });
      results.push(...response.results);
      if (response.results.length < providerEmailScanPageSize) break;
      if (page === providerEmailScanPageLimit) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', reason: 'EMAIL_SEARCH_CANDIDATE_LIMIT' });
      }
    }
    return { results };
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
    criteria: ProviderEmailCriteria | null = null,
    query: string | null = null,
  ): Promise<AmicOsVaultExactProjection[]> {
    const documentIds = [...new Set(results
      .map((item) => item.documentId)
      .filter((value): value is string => typeof value === 'string'))];
    if (documentIds.length === 0) return [];
    const matterIds = [...new Set(results
      .map((item) => item.matterId)
      .filter((value): value is string => typeof value === 'string'))];
    const readableMatterIds = (await Promise.all(matterIds.map(async (matterId) => {
      try {
        const decision = await this.permissionService.canReadMatter(
          { tenantId: principal.tenantId, userId: principal.actorUserId },
          matterId,
        );
        return decision.effect === 'ALLOW' ? matterId : null;
      } catch {
        return null;
      }
    }))).filter((value): value is string => value !== null);
    const rows = await this.auditService.transaction(principal.tenantId, (tx: QueryClient) =>
      tx.query(
        `
          SELECT
            d.document_id,
            d.matter_id,
            dv.version_id,
            dv.file_object_id,
            dv.file_hash AS sha256,
            f.size_bytes::text,
            f.mime_type,
            f.normalized_filename,
            d.created_at,
            d.updated_at,
            creator.name AS creator_name,
            CASE WHEN d.matter_id = ANY($3::uuid[]) THEN
              coalesce(nullif(m.metadata_json ->> 'lawosMatterCode', ''), m.matter_code)
            END AS canonical_matter_code,
            CASE WHEN d.matter_id = ANY($3::uuid[]) THEN m.matter_name END AS canonical_matter_name,
            CASE WHEN d.matter_id = ANY($3::uuid[]) THEN
              coalesce(
                nullif(c.metadata_json ->> 'lawosClientId', ''),
                nullif(c.metadata_json ->> 'matterAppClientId', '')
              )
            END AS canonical_client_id,
            CASE WHEN d.matter_id = ANY($3::uuid[]) THEN c.name END AS canonical_client_name,
            coalesce(
              nullif(m.metadata_json ->> 'lawosMatterId', ''),
              nullif(m.metadata_json ->> 'matterAppMatterId', '')
            ) AS lawos_matter_id,
            email.email_id,
            email.subject AS email_subject,
            email.sent_at AS email_sent_at,
            email.received_at AS email_received_at,
            email.filed_at AS email_filed_at,
            email.storage_uri AS email_storage_uri,
            email.raw_file_object_id AS email_raw_file_object_id,
            email.raw_sha256 AS email_raw_sha256,
            email.raw_size_bytes AS email_raw_size_bytes,
            email.raw_mime_type AS email_raw_mime_type,
            email.raw_filename AS email_raw_filename
          FROM documents d
          JOIN matters m
            ON m.tenant_id = d.tenant_id
           AND m.matter_id = d.matter_id
          LEFT JOIN clients c
            ON c.tenant_id = m.tenant_id
           AND c.client_id = m.client_id
           AND d.matter_id = ANY($3::uuid[])
          JOIN document_versions dv
            ON dv.tenant_id = d.tenant_id
           AND dv.document_id = d.document_id
           AND dv.version_status = 'current'
          JOIN file_objects f
            ON f.tenant_id = dv.tenant_id
           AND f.file_object_id = dv.file_object_id
          LEFT JOIN users creator
            ON creator.tenant_id = d.tenant_id
           AND creator.user_id = d.created_by
          LEFT JOIN LATERAL (
            SELECT
              em.email_id,
              em.subject,
              em.sent_at,
              em.received_at,
              filing.created_at AS filed_at,
              raw_file.storage_uri,
              raw_file.file_object_id AS raw_file_object_id,
              em.raw_sha256,
              em.raw_size_bytes::text AS raw_size_bytes,
              raw_file.mime_type AS raw_mime_type,
              raw_file.normalized_filename AS raw_filename
            FROM email_matter_filings filing
            JOIN email_messages em
              ON em.tenant_id = filing.tenant_id
             AND em.email_id = filing.email_id
            JOIN file_objects raw_file
              ON raw_file.tenant_id = em.tenant_id
             AND raw_file.file_object_id = em.raw_file_object_id
             AND raw_file.sha256 = em.raw_sha256
             AND raw_file.size_bytes = em.raw_size_bytes
             AND lower(raw_file.mime_type) = 'message/rfc822'
            WHERE filing.tenant_id = d.tenant_id
              AND filing.matter_id = d.matter_id
              AND filing.body_document_id = d.document_id
            ORDER BY filing.created_at DESC, em.email_id ASC
            LIMIT 1
          ) email ON true
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
        [principal.tenantId, documentIds, readableMatterIds],
      ));
    const exactByDocument = new Map(
      (rows.rows as ExactProjectionRow[])
        .filter((row) => lawosMatterId(row) !== null)
        .map((row) => [row.document_id, row]),
    );
    const emailByDocument = new Map<string, AmicOsVaultEmailMessageProjection>();
    const exactRows = rows.rows as ExactProjectionRow[];
    if (criteria || exactRows.some((row) => row.email_id)) {
      const emailRows = exactRows.filter(
        (row): row is ExactProjectionRow & { email_id: string } => typeof row.email_id === 'string',
      );
      for (let offset = 0; offset < emailRows.length; offset += providerEmailHeaderReadConcurrency) {
        const batch = emailRows.slice(offset, offset + providerEmailHeaderReadConcurrency);
        const messages = await Promise.all(batch.map((row) => this.emailMessageForRow(principal, row, criteria)));
        messages.forEach((message, index) => {
          if (message) {
            const row = batch[index];
            if (row) emailByDocument.set(row.document_id, message);
          }
        });
      }
    }
    const emitted = new Set<string>();
    return results.flatMap((item): AmicOsVaultExactProjection[] => {
      if (!item.documentId || !item.versionId || !item.matterId) return [];
      if (emitted.has(item.documentId)) return [];
      const exact = exactByDocument.get(item.documentId);
      const mappedMatterId = exact ? lawosMatterId(exact) : null;
      const size = Number(exact?.size_bytes);
      const createdAt = exact ? canonicalInstant(exact.created_at) : null;
      const editedAt = exact ? canonicalInstant(exact.updated_at) : null;
      if (!exact
          || !mappedMatterId
          || exact.matter_id !== item.matterId
          || exact.version_id !== item.versionId
          || !Number.isSafeInteger(size)
          || size < 1
          || !createdAt
          || !editedAt
          || editedAt < createdAt) return [];
      const clientDisplayName = displayText(exact.canonical_client_name, 1_000);
      const emailMessage = emailByDocument.get(item.documentId);
      const emailSource = exact.email_id ? emailSourceForRow(exact) : null;
      if (criteria && (!emailMessage || !emailSource)) return [];
      if (criteria && emailMessage && !emailHeaderMatchesQuery(emailMessage, query)
          && (!query?.trim() || completeEmailAddressQuery(query)
            || !item.snippet?.trim())) return [];
      emitted.add(item.documentId);
      return [{
        document_id: item.documentId,
        matter_id: mappedMatterId,
        title: item.title,
        // The current Matter/Client relation is projected only after its own read check.
        matter_code: displayText(exact.canonical_matter_code, 120),
        matter_name: displayText(exact.canonical_matter_name, 1_000),
        client_id: safeExternalId(exact.canonical_client_id),
        client_name: displayText(clientDisplayName, 200),
        client_display_name: clientDisplayName,
        // AMIC Vault has no authoritative legacy metadata-code field at this revision.
        metadata_code: null,
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
        created_at: createdAt,
        edited_at: editedAt,
        author_name: displayText(item.author?.displayName, 200),
        creator_name: displayText(exact.creator_name, 200),
        indexed_at: null,
        match_fields: emailMatchFields(item, emailMessage, query),
        ...(emailMessage ? { email_message: emailMessage } : {}),
        ...(emailSource ? { email_source: emailSource } : {}),
      }];
    });
  }

  private async emailMessageForRow(
    principal: AmicOsVaultProviderPrincipal,
    row: ExactProjectionRow & { email_id: string },
    criteria: ProviderEmailCriteria | null,
  ): Promise<AmicOsVaultEmailMessageProjection | null> {
    if (criteria && !emailSourceForRow(row)) return null;
    const direction = emailDirectionFor(row);
    const sentAt = canonicalInstant(row.email_sent_at ?? new Date(Number.NaN));
    const receivedAt = canonicalInstant(row.email_received_at ?? new Date(Number.NaN));
    const filedAt = canonicalInstant(row.email_filed_at ?? new Date(Number.NaN));
    const subject = displayText(row.email_subject, 500);
    let from: string | null = null;
    let to: string[] = [];
    let headerRead = false;
    if (this.storageService && row.email_storage_uri && emailSourceForRow(row)) {
      try {
        const stored = await this.storageService.getByStorageUri(principal.tenantId, row.email_storage_uri);
        const prefix = await readEmailHeaderPrefix(stored.body);
        if (prefix) {
          const metadata = normalizeEmailMetadata(decodeEmlRawContent(Buffer.from(prefix, 'latin1')));
          headerRead = true;
          // Search matches the persisted subject; keep the displayed title
          // aligned with that same authoritative indexed value.
          from = metadata.participants.find((participant) => participant.role === 'from')?.normalizedAddress ?? null;
          to = metadata.participants
            .filter((participant) => participant.role === 'to')
            .map((participant) => participant.normalizedAddress);
        }
      } catch {
        // A search result with email criteria requires the immutable header;
        // other document reads can still omit its address projection.
      }
    }
    if (criteria && !headerRead) return null;
    if (!subject && !from && to.length === 0 && !sentAt && !receivedAt && !filedAt) return null;
    const message: AmicOsVaultEmailMessageProjection = { subject, from, to };
    if (criteria) {
      message.direction = direction;
      message.sent_at = sentAt;
      message.received_at = receivedAt;
      message.filed_at = filedAt;
      message.event_at = direction === 'sent' ? sentAt : direction === 'received' ? receivedAt : null;
    }
    return message;
  }
}

function inputMatchFields(item: SearchResultDto): string[] {
  if (item.snippet?.trim()) return ['body_text'];
  return ['title'];
}
