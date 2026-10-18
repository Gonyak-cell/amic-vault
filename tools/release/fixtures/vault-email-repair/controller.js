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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmicOsVaultReadController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../../auth/public.decorator");
const amic_os_vault_provider_guard_1 = require("./amic-os-vault-provider.guard");
const amic_os_vault_read_service_1 = require("./amic-os-vault-read.service");
const preview_service_1 = require("../../preview/preview.service");
const preview_convert_job_1 = require("../../preview/preview-convert.job");
const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const date = /^\d{4}-\d{2}-\d{2}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function invalid() {
    return new common_1.BadRequestException({ code: 'VALIDATION_FAILED' });
}
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw invalid();
    return value;
}
function exactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    if (keys.length !== expected.length
        || keys.some((key, index) => key !== [...expected].sort()[index]))
        throw invalid();
}
function principalAccountLedgerId(value) {
    const input = object(value);
    exactKeys(input, ['tenant_id', 'user_id']);
    if (typeof input.tenant_id !== 'string' || !safeRef.test(input.tenant_id))
        throw invalid();
    const userId = typeof input.user_id === 'string'
        ? input.user_id.trim().toLowerCase()
        : '';
    if (!accountLedgerId.test(userId))
        throw invalid();
    return userId;
}
function matterId(value) {
    if (value === null)
        return null;
    if (typeof value !== 'string' || !safeRef.test(value))
        throw invalid();
    return value;
}
function page(value, maximum) {
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum)
        throw invalid();
    return Number(value);
}
function optionalDate(value) {
    if (value === null)
        return null;
    const parsed = typeof value === 'string'
        ? new Date(`${value}T00:00:00.000Z`)
        : new Date(Number.NaN);
    if (typeof value !== 'string'
        || !date.test(value)
        || Number.isNaN(parsed.getTime())
        || parsed.toISOString().slice(0, 10) !== value) {
        throw invalid();
    }
    return value;
}
function parseList(value) {
    const input = object(value);
    exactKeys(input, ['principal', 'lawos_matter_id', 'page', 'page_size']);
    return {
        accountLedgerId: principalAccountLedgerId(input.principal),
        lawosMatterId: matterId(input.lawos_matter_id),
        page: page(input.page, 1_000),
        pageSize: page(input.page_size, 50),
        query: null,
        dateFrom: null,
        dateTo: null,
    };
}
function parseSearch(value) {
    const input = object(value);
    const optionalInactive = ['body_q', 'mime_type', 'matter_code', 'matter_name', 'client_code',
        'client_name', 'tags', 'code_basis', 'metadata_codes',
        'email_date_basis', 'email_sort', 'email_sort_order', 'email_direction'];
    const inactiveKeys = optionalInactive.filter((key) => Object.hasOwn(input, key));
    if (inactiveKeys.some((key) => input[key] !== null && !(key === 'metadata_codes'
        && Array.isArray(input[key]) && input[key].length === 0)))
        throw invalid();
    exactKeys(input, [
        ...inactiveKeys,
        ...(Object.hasOwn(input, 'sort_by') ? ['sort_by'] : []),
        'principal',
        'query',
        'lawos_matter_id',
        'current_version_only',
        'date_from',
        'date_to',
        ...(Object.hasOwn(input, 'date_basis') ? ['date_basis'] : []),
        'page',
        'page_size',
    ]);
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    const dateFrom = optionalDate(input.date_from);
    const dateTo = optionalDate(input.date_to);
    const sortBy = input.sort_by == null ? null : input.sort_by;
    if (sortBy !== null && !['relevance', 'updated_desc', 'updated_asc', 'title_asc', 'matter_asc', 'type_asc'].includes(sortBy)) throw invalid();
    const dateBasis = input.date_basis ?? 'created_or_modified';
    if (!['modified', 'created', 'created_or_modified'].includes(String(dateBasis)))
        throw invalid();
    // Native search dates refer to documents.updated_at. Other date semantics
    // must fail explicitly rather than silently returning the wrong interval.
    if ((dateFrom || dateTo) && dateBasis !== 'modified')
        throw invalid();
    if (query.length > 2_000
        || input.current_version_only !== true
        || (dateFrom && dateTo && dateFrom > dateTo))
        throw invalid();
    return {
        accountLedgerId: principalAccountLedgerId(input.principal),
        lawosMatterId: matterId(input.lawos_matter_id),
        page: page(input.page, 1_000),
        pageSize: page(input.page_size, 50),
        query: query || null,
        dateFrom,
        dateTo,
        dateBasis: dateBasis,
        sortBy,
    };
}
function parseVersions(value) {
    const input = object(value);
    exactKeys(input, ['principal', 'lawos_matter_id', 'document_id', 'page', 'page_size']);
    const mappedMatterId = matterId(input.lawos_matter_id);
    if (!mappedMatterId)
        throw invalid();
    return {
        accountLedgerId: principalAccountLedgerId(input.principal),
        lawosMatterId: mappedMatterId,
        documentId: parseUuid(input.document_id),
        page: page(input.page, 1_000),
        pageSize: page(input.page_size, 50),
    };
}
function principal(request) {
    if (!request.amicOsVaultPrincipal)
        throw invalid();
    return request.amicOsVaultPrincipal;
}
function parseUuid(value) {
    if (typeof value !== 'string' || !uuid.test(value))
        throw invalid();
    return value.toLowerCase();
}
function previewFileFields(input) {
    if (typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sha256)
        || typeof input.mime_type !== 'string'
        || (input.mime_type !== 'application/pdf' && !(0, preview_service_1.isOfficePreviewMimeType)(input.mime_type)))
        throw invalid();
    const size = page(input.byte_size, Number.MAX_SAFE_INTEGER);
    if (input.mime_type !== 'application/pdf' && size > preview_convert_job_1.PREVIEW_MAX_INPUT_BYTES)
        throw invalid();
    return {
        file_object_id: parseUuid(input.file_object_id),
        sha256: input.sha256,
        byte_size: size,
        mime_type: input.mime_type,
    };
}
function parsePreview(value, extraKeys = []) {
    const input = object(value);
    exactKeys(input, ['principal', 'lawos_matter_id', 'requested_exact_version', ...extraKeys]);
    const exact = object(input.requested_exact_version);
    exactKeys(exact, ['document_id', 'version_id', 'file_object_id', 'sha256', 'byte_size', 'mime_type']);
    const mappedMatterId = matterId(input.lawos_matter_id);
    if (!mappedMatterId)
        throw invalid();
    return {
        accountLedgerId: principalAccountLedgerId(input.principal),
        lawosMatterId: mappedMatterId,
        exact: { document_id: parseUuid(exact.document_id), version_id: parseUuid(exact.version_id), ...previewFileFields(exact) },
    };
}
function parsePreviewFile(value) {
    const input = object(value);
    exactKeys(input, ['file_object_id', 'sha256', 'byte_size', 'mime_type']);
    const file = previewFileFields(input);
    if (file.mime_type !== 'application/pdf')
        throw invalid();
    return { ...file, mime_type: 'application/pdf' };
}
let AmicOsVaultReadController = class AmicOsVaultReadController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(request, body) {
        return this.service.list(principal(request), parseList(body));
    }
    search(request, body) {
        return this.service.search(principal(request), parseSearch(body));
    }
    versions(request, body) {
        return this.service.versions(principal(request), parseVersions(body));
    }
    portalDocument(request, body) {
        const value = object(body);
        exactKeys(value, ['principal', 'lawos_matter_id', 'document_id']);
        const mappedMatterId = matterId(value.lawos_matter_id);
        if (!mappedMatterId)
            throw invalid();
        return this.service.portalDocument(principal(request), {
            accountLedgerId: principalAccountLedgerId(value.principal),
            lawosMatterId: mappedMatterId, documentId: parseUuid(value.document_id),
        });
    }
    preparePreview(request, body) {
        const input = parsePreview(body, ['enqueue']);
        const enqueue = object(body).enqueue;
        if (typeof enqueue !== 'boolean')
            throw invalid();
        return this.service.preparePreview(principal(request), input, enqueue);
    }
    issuePreviewSession(request, body) {
        return this.service.issuePreviewSession(principal(request), parsePreview(body));
    }
    previewChunk(request, body) {
        const input = parsePreview(body, ['preview_session_id', 'token', 'preview', 'offset']);
        const raw = object(body);
        if (typeof raw.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(raw.token)
            || !Number.isSafeInteger(raw.offset) || Number(raw.offset) < 0
            || Number(raw.offset) % preview_service_1.PREVIEW_CHUNK_BYTES !== 0)
            throw invalid();
        return this.service.previewChunk(principal(request), {
            ...input,
            previewSessionId: parseUuid(raw.preview_session_id),
            token: raw.token,
            preview: parsePreviewFile(raw.preview),
            offset: Number(raw.offset),
        });
    }
};
exports.AmicOsVaultReadController = AmicOsVaultReadController;
__decorate([
    (0, common_1.Post)('documents'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", typeof (_b = typeof Promise !== "undefined" && Promise) === "function" ? _b : Object)
], AmicOsVaultReadController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('search'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", typeof (_c = typeof Promise !== "undefined" && Promise) === "function" ? _c : Object)
], AmicOsVaultReadController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('versions'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", typeof (_d = typeof Promise !== "undefined" && Promise) === "function" ? _d : Object)
], AmicOsVaultReadController.prototype, "versions", null);
__decorate([
    (0, common_1.Post)('portal-document'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AmicOsVaultReadController.prototype, "portalDocument", null);
__decorate([
    (0, common_1.Post)('preview-prepare'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AmicOsVaultReadController.prototype, "preparePreview", null);
__decorate([
    (0, common_1.Post)('preview-sessions'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AmicOsVaultReadController.prototype, "issuePreviewSession", null);
__decorate([
    (0, common_1.Post)('preview-chunk'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Cache-Control', 'private, no-store'),
    (0, common_1.Header)('X-Content-Type-Options', 'nosniff'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AmicOsVaultReadController.prototype, "previewChunk", null);
exports.AmicOsVaultReadController = AmicOsVaultReadController = __decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(amic_os_vault_provider_guard_1.AmicOsVaultProviderGuard),
    (0, common_1.Controller)('integrations/amic-os/vault/read'),
    __param(0, (0, common_1.Inject)(amic_os_vault_read_service_1.AmicOsVaultReadService)),
    __metadata("design:paramtypes", [typeof (_a = typeof amic_os_vault_read_service_1.AmicOsVaultReadService !== "undefined" && amic_os_vault_read_service_1.AmicOsVaultReadService) === "function" ? _a : Object])
], AmicOsVaultReadController);
