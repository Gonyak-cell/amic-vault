"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmicOsVaultReadService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../audit/audit.service");
const search_service_1 = require("../../search/search.service");
const external_service_1 = require("../../external/external.service");
const document_version_service_1 = require("../../document/document-version.service");
const tenant_context_1 = require("../../tenant/tenant-context");
const preview_precreate_queue_service_1 = require("../../preview/preview-precreate-queue.service");
const preview_session_service_1 = require("../../preview/preview-session.service");
const preview_service_1 = require("../../preview/preview.service");
const amic_os_vault_provider_guard_1 = require("./amic-os-vault-provider.guard");
function permissionDenied() {
    return new common_1.ForbiddenException({ code: 'PERMISSION_DENIED' });
}
function previewUnavailable() {
    return new common_1.BadRequestException({ code: 'VALIDATION_FAILED', reason: 'PREVIEW_CONVERSION_UNAVAILABLE' });
}
function previewFile(file) {
    const size = Number(file.size_bytes);
    if (file.mime_type !== 'application/pdf' || !Number.isSafeInteger(size) || size < 1
        || !/^[a-f0-9]{64}$/u.test(file.sha256))
        throw previewUnavailable();
    return { file_object_id: file.file_object_id, sha256: file.sha256, byte_size: size, mime_type: 'application/pdf' };
}
function lawosMatterId(row) {
    const value = row.lawos_matter_id?.trim();
    return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value) ? value : null;
}
let AmicOsVaultReadService = class AmicOsVaultReadService {
    auditService;
    searchService;
    tenantContext;
    config;
    previewSessions;
    previews;
    previewQueue;
    external;
    documentVersions;
    constructor(auditService, searchService, tenantContext, config, previewSessions, previews, previewQueue, external, documentVersions) {
        this.auditService = auditService;
        this.searchService = searchService;
        this.tenantContext = tenantContext;
        this.config = config;
        this.previewSessions = previewSessions;
        this.previews = previews;
        this.previewQueue = previewQueue;
        this.external = external;
        this.documentVersions = documentVersions;
    }
    async list(principal, input) {
        return this.read(principal, { ...input, query: null });
    }
    async search(principal, input) {
        return this.read(principal, input);
    }
    async versions(principal, input) {
        this.assertPrincipal(principal, input.accountLedgerId);
        const matterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
        const target = await this.documentVersions.findVersionTarget(principal.tenantId, input.documentId);
        if (!target || target.matter_id !== matterId)
            throw permissionDenied();
        const versions = await this.documentVersions.listVersions(principal.actorUserId, input.documentId, {});
        const offset = (input.page - 1) * input.pageSize;
        const pageItems = versions.items.slice(offset, offset + input.pageSize);
        const fileIds = pageItems.map((item) => item.fileObjectId);
        const files = fileIds.length === 0
            ? []
            : (await this.auditService.transaction(principal.tenantId, (tx) => tx.query(`SELECT file_object_id, size_bytes::text, mime_type
           FROM file_objects
           WHERE tenant_id = $1::uuid AND file_object_id = ANY($2::uuid[])`, [principal.tenantId, fileIds]))).rows;
        const fileById = new Map(files.map((file) => [file.file_object_id, file]));
        const items = pageItems.map((version) => {
            const file = fileById.get(version.fileObjectId);
            const size = Number(file?.size_bytes);
            if (!file || !Number.isSafeInteger(size) || size < 1)
                throw permissionDenied();
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
    async portalDocument(principal, input) {
        this.assertPrincipal(principal, input.accountLedgerId);
        const matterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
        const authorization = await this.external.authorizePortalDocument({ tenantId: principal.tenantId, userId: principal.actorUserId }, matterId, input.documentId);
        const result = await this.auditService.transaction(principal.tenantId, tx => tx.query(`SELECT v.document_id, v.version_id, v.file_object_id, v.file_hash AS sha256,
              f.size_bytes::text, f.mime_type
       FROM document_versions v
       JOIN file_objects f ON f.tenant_id = v.tenant_id AND f.file_object_id = v.file_object_id
       WHERE v.tenant_id = $1::uuid AND v.document_id = $2::uuid
         AND v.version_id = $3::uuid AND v.version_status = 'current'`, [principal.tenantId, input.documentId, authorization.versionId]));
        const row = result.rows[0];
        const size = Number(row?.size_bytes);
        if (result.rows.length !== 1 || !row || row.document_id !== input.documentId
            || row.version_id !== authorization.versionId || !Number.isSafeInteger(size) || size < 1
            || size > 25 * 1024 * 1024 || row.mime_type !== 'application/pdf'
            || !/^[a-f0-9]{64}$/u.test(row.sha256))
            throw permissionDenied();
        return {
            authority_kind: 'amic-vault-api',
            authority_ref: this.config.uploadAuthorityRef(), provider_revision: this.config.uploadProviderRevision(),
            exact_version: { document_id: row.document_id, version_id: row.version_id, file_object_id: row.file_object_id,
                sha256: row.sha256, byte_size: size, mime_type: row.mime_type },
            policy_ref: authorization.policyRef,
        };
    }
    async preparePreview(principal, input, enqueue) {
        const original = await this.previewTarget(principal, input);
        const { tenantId } = this.tenantContext.require();
        const prepared = await this.previews.getPreparedPreview(tenantId, original);
        if (prepared.status === 'ready') {
            return { ...this.previewAuthority(input), status: 'ready', preview: previewFile(prepared.file) };
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
                await tx.query(`INSERT INTO document_preview_artifacts (
             tenant_id, document_id, version_id, file_object_id, status, failure_reason_code,
             source_sha256, converter_profile_sha256
           ) VALUES ($1, $2, $3, $4, 'pending', NULL, $5, $6)
           ON CONFLICT (tenant_id, version_id) DO UPDATE
             SET status = 'pending', failure_reason_code = NULL, updated_at = now(),
               source_sha256 = EXCLUDED.source_sha256,
               converter_profile_sha256 = EXCLUDED.converter_profile_sha256
           WHERE document_preview_artifacts.status = 'failed'
             OR document_preview_artifacts.source_sha256 IS DISTINCT FROM EXCLUDED.source_sha256
             OR document_preview_artifacts.converter_profile_sha256 IS DISTINCT FROM EXCLUDED.converter_profile_sha256`, [principal.tenantId, original.document_id, original.version_id, original.file_object_id,
                    original.sha256, prepared.converterProfileSha256]);
            });
        }
        return { ...this.previewAuthority(input), status: enqueue ? 'pending' : prepared.status, preview: null };
    }
    async issuePreviewSession(principal, input) {
        const original = await this.previewTarget(principal, input);
        const prepared = await this.previews.getPreparedPreview(this.tenantContext.require().tenantId, original);
        if (prepared.status !== 'ready')
            throw previewUnavailable();
        const file = previewFile(prepared.file);
        const session = await this.previewSessions.issue(principal.actorUserId, original.document_id, input.exact);
        return { ...this.previewAuthority(input), status: 'ready', preview: file, session, chunk_bytes: preview_service_1.PREVIEW_CHUNK_BYTES };
    }
    async previewChunk(principal, input) {
        const original = await this.previewTarget(principal, input);
        const { tenantId } = this.tenantContext.require();
        const prepared = await this.previews.getPreparedPreview(tenantId, original);
        if (prepared.status !== 'ready')
            throw previewUnavailable();
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
                sha256: (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex'),
                content_base64: bytes.toString('base64'),
            },
            next_offset: input.offset + bytes.byteLength,
            final_chunk: input.offset + bytes.byteLength === file.byte_size,
        };
    }
    previewAuthority(input) {
        return {
            authority_kind: 'amic-vault-api',
            authority_ref: this.config.uploadAuthorityRef(),
            provider_revision: this.config.uploadProviderRevision(),
            exact_version: input.exact,
        };
    }
    async previewTarget(principal, input) {
        this.assertPrincipal(principal, input.accountLedgerId);
        const vaultMatterId = await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId);
        const original = 'previewSessionId' in input
            ? await this.previewSessions.authorizeStream(principal.actorUserId, input.exact.document_id, input.previewSessionId, input.token, input.exact)
            : await this.previewSessions.inspect(principal.actorUserId, input.exact.document_id, input.exact);
        if (original.matter_id !== vaultMatterId)
            throw permissionDenied();
        return original;
    }
    async read(principal, input) {
        this.assertPrincipal(principal, input.accountLedgerId);
        const vaultMatterId = input.lawosMatterId
            ? await this.resolveLawosMatter(principal.tenantId, input.lawosMatterId)
            : null;
        const filters = {
            versionStatus: 'current',
            ...(vaultMatterId ? { matterId: vaultMatterId } : {}),
            ...(input.dateFrom ? { dateFrom: `${input.dateFrom}T00:00:00.000Z` } : {}),
            ...(input.dateTo ? { dateTo: `${input.dateTo}T23:59:59.999Z` } : {}),
        };
        // Page only permission-visible, exact-version projections; a dropped mapping
        // must not create a false end-of-list or reveal an omitted count.
        const offset = (input.page - 1) * input.pageSize;
        const needed = offset + input.pageSize + 1;
        const visible = [];
        const emitted = new Set();
        let exhausted = false;
        for (let sourcePage = 1; sourcePage <= 1_000; sourcePage += 1) {
            const response = await this.searchService.search({ tenantId: principal.tenantId, userId: principal.actorUserId, sessionId: null }, { ...(input.query ? { query: input.query } : {}), mode: 'keyword', target: 'all',
                sortBy: input.query ? 'relevance' : 'updated_desc', groupBy: 'none', filters,
                page: sourcePage, pageSize: 50 });
            for (const item of await this.projectExactVersions(principal, response.results)) {
                if (!emitted.has(item.document_id)) {
                    emitted.add(item.document_id);
                    visible.push(item);
                }
            }
            if (visible.length >= needed)
                break;
            if (response.results.length < 50) {
                exhausted = true;
                break;
            }
        }
        if (!exhausted && visible.length < needed) {
            throw new common_1.BadRequestException({ code: 'VALIDATION_FAILED', reason: 'READ_PAGINATION_LIMIT' });
        }
        if (input.page === 1_000 && visible.length > offset + input.pageSize) {
            throw new common_1.BadRequestException({ code: 'VALIDATION_FAILED', reason: 'READ_PAGINATION_LIMIT' });
        }
        const projected = visible.slice(offset, offset + input.pageSize);
        return {
            authority_kind: 'amic-vault-api',
            authority_ref: this.config.uploadAuthorityRef(),
            provider_revision: this.config.uploadProviderRevision(),
            items: projected,
            page_info: {
                page: input.page,
                page_size: input.pageSize,
                returned_count: projected.length,
                has_more: visible.length > offset + input.pageSize,
                current_version_only: true,
                omitted_result_count: null,
            },
            count_leak_prevented: true,
            raw_bytes_included: false,
            storage_locator_returned: false,
        };
    }
    assertPrincipal(principal, accountLedgerId) {
        const context = this.tenantContext.require();
        if (context.source !== 'amic-os-provider'
            || context.tenantId !== principal.tenantId
            || principal.accountLedgerId !== accountLedgerId) {
            throw permissionDenied();
        }
    }
    async resolveLawosMatter(tenantId, value) {
        return this.auditService.transaction(tenantId, async (tx) => {
            const result = await tx.query(`
          SELECT matter_id
          FROM matters
          WHERE tenant_id = $1::uuid
            AND (
              metadata_json ->> 'lawosMatterId' = $2
              OR metadata_json ->> 'matterAppMatterId' = $2
            )
          ORDER BY matter_id
          LIMIT 2
        `, [tenantId, value]);
            const rows = result.rows;
            if (rows.length !== 1 || !rows[0])
                throw permissionDenied();
            return rows[0].matter_id;
        });
    }
    async projectExactVersions(principal, results) {
        const documentIds = [...new Set(results
                .map((item) => item.documentId)
                .filter((value) => typeof value === 'string'))];
        if (documentIds.length === 0)
            return [];
        const rows = await this.auditService.transaction(principal.tenantId, (tx) => tx.query(`
          SELECT
            d.document_id,
            d.created_at, d.updated_at, d.created_by, creator.name AS creator_name,
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
          LEFT JOIN users creator ON creator.tenant_id = d.tenant_id AND creator.user_id = d.created_by
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
        `, [principal.tenantId, documentIds]));
        const exactByDocument = new Map(rows.rows
            .filter((row) => lawosMatterId(row) !== null)
            .map((row) => [row.document_id, row]));
        const emitted = new Set();
        return results.flatMap((item) => {
            if (!item.documentId || !item.versionId || !item.matterId)
                return [];
            if (emitted.has(item.documentId))
                return [];
            const exact = exactByDocument.get(item.documentId);
            const mappedMatterId = exact ? lawosMatterId(exact) : null;
            const size = Number(exact?.size_bytes);
            if (!exact
                || !mappedMatterId
                || exact.version_id !== item.versionId
                || !Number.isSafeInteger(size)
                || size < 1)
                return [];
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
                    created_at: (typeof exact.created_at === 'string' ? new Date(exact.created_at) : exact.created_at).toISOString(),
                    edited_at: (typeof exact.updated_at === 'string' ? new Date(exact.updated_at) : exact.updated_at).toISOString(),
                    creator_user_id: exact.created_by,
                    author_name: item.author?.displayName ?? null,
                    client_name: item.clientDisplayName ?? null,
                    creator_name: exact.creator_name,
                    editor_user_id: null,
                    matter_code: item.matterDisplayCode ?? null,
                    matter_name: item.matterDisplayName ?? null,
                    client_id: item.clientId ?? null,
                    client_display_name: item.clientDisplayName ?? null,
                    metadata_code: null,
                    indexed_at: null,
                    match_fields: inputMatchFields(item),
                }];
        });
    }
};
exports.AmicOsVaultReadService = AmicOsVaultReadService;
exports.AmicOsVaultReadService = AmicOsVaultReadService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(audit_service_1.AuditService)),
    __param(1, (0, common_1.Inject)(search_service_1.SearchService)),
    __param(2, (0, common_1.Inject)(tenant_context_1.TenantContextService)),
    __param(3, (0, common_1.Inject)(amic_os_vault_provider_guard_1.AmicOsVaultProviderConfig)),
    __param(4, (0, common_1.Inject)(preview_session_service_1.PreviewSessionService)),
    __param(5, (0, common_1.Inject)(preview_service_1.PreviewService)),
    __param(6, (0, common_1.Inject)(preview_precreate_queue_service_1.PreviewPrecreateQueueService)),
    __param(7, (0, common_1.Inject)(external_service_1.ExternalService)),
    __param(8, (0, common_1.Inject)(document_version_service_1.DocumentVersionService)),
    __metadata("design:paramtypes", [typeof (_a = typeof audit_service_1.AuditService !== "undefined" && audit_service_1.AuditService) === "function" ? _a : Object, typeof (_b = typeof search_service_1.SearchService !== "undefined" && search_service_1.SearchService) === "function" ? _b : Object, typeof (_c = typeof tenant_context_1.TenantContextService !== "undefined" && tenant_context_1.TenantContextService) === "function" ? _c : Object, typeof (_d = typeof amic_os_vault_provider_guard_1.AmicOsVaultProviderConfig !== "undefined" && amic_os_vault_provider_guard_1.AmicOsVaultProviderConfig) === "function" ? _d : Object, typeof (_e = typeof preview_session_service_1.PreviewSessionService !== "undefined" && preview_session_service_1.PreviewSessionService) === "function" ? _e : Object, typeof (_f = typeof preview_service_1.PreviewService !== "undefined" && preview_service_1.PreviewService) === "function" ? _f : Object, typeof (_g = typeof preview_precreate_queue_service_1.PreviewPrecreateQueueService !== "undefined" && preview_precreate_queue_service_1.PreviewPrecreateQueueService) === "function" ? _g : Object, typeof (_h = typeof external_service_1.ExternalService !== "undefined" && external_service_1.ExternalService) === "function" ? _h : Object, typeof (_j = typeof document_version_service_1.DocumentVersionService !== "undefined" && document_version_service_1.DocumentVersionService) === "function" ? _j : Object])
], AmicOsVaultReadService);
function inputMatchFields(item) {
    if (item.snippet?.trim())
        return ['body_text'];
    return ['title'];
}
