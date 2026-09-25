import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import {
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultReadService } from './amic-os-vault-read.service';
import type {
  AmicOsVaultReadInput,
  AmicOsVaultReadResponse,
  AmicOsVaultVersionReadInput,
  AmicOsVaultVersionReadResponse,
  AmicOsVaultLatestReadResponse,
  AmicOsVaultPreviewInput,
  AmicOsVaultPreviewFile,
} from './amic-os-vault-read.service';
import { searchSorts } from '@amic-vault/shared';
import { isOfficePreviewMimeType, PREVIEW_CHUNK_BYTES } from '../../preview/preview.service';
import { PREVIEW_MAX_INPUT_BYTES } from '../../preview/preview-convert.job';

const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const date = /^\d{4}-\d{2}-\d{2}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const mimeType = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u;
const tagText = /^.{1,80}$/su;
const emailTimeFields = new Set(['event_at', 'sent_at', 'received_at', 'filed_at'] as const);
const emailDirections = new Set(['sent', 'received'] as const);
const vaultCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function invalid(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[]): void {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length
      || keys.some((key, index) => key !== [...expected].sort()[index])) throw invalid();
}

function principalAccountLedgerId(value: unknown): string {
  const input = object(value);
  exactKeys(input, ['tenant_id', 'user_id']);
  if (typeof input.tenant_id !== 'string' || !safeRef.test(input.tenant_id)) throw invalid();
  const userId = typeof input.user_id === 'string'
    ? input.user_id.trim().toLowerCase()
    : '';
  if (!accountLedgerId.test(userId)) throw invalid();
  return userId;
}

function matterId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !safeRef.test(value)) throw invalid();
  return value;
}

function page(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw invalid();
  return Number(value);
}

function optionalDate(value: unknown): string | null {
  if (value === null) return null;
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

function optionalSearchText(value: unknown, maximum = 128): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalid();
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > maximum
      || [...normalized].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
      })) throw invalid();
  return normalized;
}

function optionalMimeTypes(value: unknown): string[] | null {
  if (value === undefined || value === null || value === '') return null;
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
  if (!values || values.length < 1 || values.length > 32) throw invalid();
  const normalized = values.map((item) => {
    if (typeof item !== 'string') throw invalid();
    const mime = item.trim().toLowerCase();
    if (mime.length > 255 || !mimeType.test(mime)) throw invalid();
    return mime;
  });
  if (new Set(normalized).size !== normalized.length) throw invalid();
  return normalized;
}

function optionalTags(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const normalized = value.map((item) => {
    if (typeof item !== 'string') throw invalid();
    const tag = item.normalize('NFC').trim();
    if (!tagText.test(tag) || [...tag].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    })) throw invalid();
    return tag;
  });
  if (new Set(normalized).size !== normalized.length) throw invalid();
  return normalized;
}

function optionalMetadataCodes(value: unknown, basis: 'matter' | 'legacy' | null): string[] | null {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value) || value.length > 20) throw invalid();
  const codes = value.map((item: unknown) => {
    if (typeof item !== 'string' || (basis === 'matter'
      ? item.length < 1 || item.length > 120 || /[\p{Cc}]/u.test(item)
      : !vaultCode.test(item))) throw invalid();
    return item;
  });
  if (new Set(codes).size !== codes.length) throw invalid();
  return codes;
}

function optionalSort(value: unknown): (typeof searchSorts)[number] | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !searchSorts.includes(value as (typeof searchSorts)[number])) throw invalid();
  return value as (typeof searchSorts)[number];
}

function dateBasis(value: unknown): 'created' | 'modified' | 'created_or_modified' {
  if (value === undefined || value === null || value === '') return 'modified';
  if (value === 'created' || value === 'modified' || value === 'created_or_modified') return value;
  throw invalid();
}

type EmailTimeField = 'event_at' | 'sent_at' | 'received_at' | 'filed_at';

function optionalEmailTimeField(value: unknown): EmailTimeField | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !emailTimeFields.has(value as EmailTimeField)) throw invalid();
  return value as EmailTimeField;
}

function optionalEmailSortOrder(value: unknown): 'asc' | 'desc' | null {
  if (value === undefined || value === null || value === '') return null;
  if (value !== 'asc' && value !== 'desc') throw invalid();
  return value;
}

function optionalEmailDirection(value: unknown): 'sent' | 'received' | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !emailDirections.has(value as 'sent' | 'received')) throw invalid();
  return value as 'sent' | 'received';
}

function parseList(value: unknown): AmicOsVaultReadInput {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id', 'page', 'page_size', ...(Object.hasOwn(input, 'folder_id') ? ['folder_id'] : [])]);
  const mappedMatterId = matterId(input.lawos_matter_id);
  const folderId = Object.hasOwn(input, 'folder_id') ? parseUuid(input.folder_id) : null;
  if (folderId && !mappedMatterId) throw invalid();
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: mappedMatterId,
    ...(folderId ? { folderId } : {}),
    page: page(input.page, 1_000),
    pageSize: page(input.page_size, 50),
    query: null,
    dateFrom: null,
    dateTo: null,
  };
}

function parseSearch(value: unknown): AmicOsVaultReadInput {
  const input = object(value);
  exactKeys(input, [
    'principal',
    'query',
    'lawos_matter_id',
    'current_version_only',
    'date_from',
    'date_to',
    'page',
    'page_size',
    ...(Object.hasOwn(input, 'folder_id') ? ['folder_id'] : []),
    ...(Object.hasOwn(input, 'date_basis') ? ['date_basis'] : []),
    ...(Object.hasOwn(input, 'body_q') ? ['body_q'] : []),
    ...(Object.hasOwn(input, 'mime_type') ? ['mime_type'] : []),
    ...(Object.hasOwn(input, 'matter_code') ? ['matter_code'] : []),
    ...(Object.hasOwn(input, 'matter_name') ? ['matter_name'] : []),
    ...(Object.hasOwn(input, 'client_code') ? ['client_code'] : []),
    ...(Object.hasOwn(input, 'client_name') ? ['client_name'] : []),
    ...(Object.hasOwn(input, 'tags') ? ['tags'] : []),
    ...(Object.hasOwn(input, 'sort_by') ? ['sort_by'] : []),
    ...(Object.hasOwn(input, 'code_basis') ? ['code_basis'] : []),
    ...(Object.hasOwn(input, 'metadata_codes') ? ['metadata_codes'] : []),
    ...(Object.hasOwn(input, 'email_date_basis') ? ['email_date_basis'] : []),
    ...(Object.hasOwn(input, 'email_sort') ? ['email_sort'] : []),
    ...(Object.hasOwn(input, 'email_sort_order') ? ['email_sort_order'] : []),
    ...(Object.hasOwn(input, 'email_direction') ? ['email_direction'] : []),
  ]);
  if (input.query !== undefined && input.query !== null && typeof input.query !== 'string') throw invalid();
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const bodyQuery = optionalSearchText(input.body_q, 2_000);
  const dateFrom = optionalDate(input.date_from);
  const dateTo = optionalDate(input.date_to);
  const basis = dateBasis(input.date_basis);
  const mimeTypes = optionalMimeTypes(input.mime_type);
  const matterCode = optionalSearchText(input.matter_code);
  const matterName = optionalSearchText(input.matter_name);
  const clientCode = optionalSearchText(input.client_code);
  const clientName = optionalSearchText(input.client_name);
  const tags = optionalTags(input.tags);
  const sortBy = optionalSort(input.sort_by);
  const emailDateBasis = optionalEmailTimeField(input.email_date_basis);
  const emailSort = optionalEmailTimeField(input.email_sort);
  const emailSortOrder = optionalEmailSortOrder(input.email_sort_order);
  const emailDirection = optionalEmailDirection(input.email_direction);
  const codeBasis = input.code_basis === undefined || input.code_basis === null
    ? null : input.code_basis;
  const metadataCodes = optionalMetadataCodes(input.metadata_codes,
    codeBasis === 'matter' || codeBasis === 'legacy' ? codeBasis : null);
  const emailCriteriaActive = [emailDateBasis, emailSort, emailSortOrder, emailDirection]
    .some((value) => value !== null);
  if (emailCriteriaActive
      && (mimeTypes?.length !== 1 || mimeTypes[0] !== 'message/rfc822')) throw invalid();
  if (query.length > 2_000
      || (query && bodyQuery)
      || input.current_version_only !== true
      || (dateFrom && dateTo && dateFrom > dateTo)
      || codeBasis !== null && codeBasis !== 'matter' && codeBasis !== 'legacy'
      || Boolean(metadataCodes?.length) && codeBasis === null
      || emailCriteriaActive && input.date_basis !== undefined && input.date_basis !== null
        && input.date_basis !== '' && input.date_basis !== 'created') throw invalid();
  const mappedMatterId = matterId(input.lawos_matter_id);
  const folderId = Object.hasOwn(input, 'folder_id') ? parseUuid(input.folder_id) : null;
  if (folderId && !mappedMatterId) throw invalid();
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: mappedMatterId,
    ...(folderId ? { folderId } : {}),
    page: page(input.page, 1_000),
    pageSize: page(input.page_size, 50),
    query: query || null,
    bodyQuery,
    dateFrom,
    dateTo,
    dateBasis: basis,
    mimeTypes,
    matterCode,
    matterName,
    clientCode,
    clientName,
    tags,
    sortBy,
    codeBasis: codeBasis as 'matter' | 'legacy' | null,
    metadataCodes,
    ...(emailDateBasis ? { emailDateBasis } : {}),
    ...(emailSort ? { emailSort } : {}),
    ...(emailSortOrder ? { emailSortOrder } : {}),
    ...(emailDirection ? { emailDirection } : {}),
  };
}

function parseVersions(value: unknown): AmicOsVaultVersionReadInput {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id', 'document_id', 'page', 'page_size']);
  const mappedMatterId = matterId(input.lawos_matter_id);
  if (!mappedMatterId) throw invalid();
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: mappedMatterId,
    documentId: parseUuid(input.document_id),
    page: page(input.page, 1_000),
    pageSize: page(input.page_size, 50),
  };
}

function parseFolders(value: unknown): { accountLedgerId: string; lawosMatterId: string } {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id']);
  const mappedMatterId = matterId(input.lawos_matter_id);
  if (!mappedMatterId) throw invalid();
  return { accountLedgerId: principalAccountLedgerId(input.principal), lawosMatterId: mappedMatterId };
}

function principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
  if (!request.amicOsVaultPrincipal) throw invalid();
  return request.amicOsVaultPrincipal;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw invalid();
  return value.toLowerCase();
}

function previewFileFields(input: Record<string, unknown>) {
  if (typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sha256)
      || typeof input.mime_type !== 'string'
      || (input.mime_type !== 'application/pdf' && !isOfficePreviewMimeType(input.mime_type))) throw invalid();
  const size = page(input.byte_size, Number.MAX_SAFE_INTEGER);
  if (input.mime_type !== 'application/pdf' && size > PREVIEW_MAX_INPUT_BYTES) throw invalid();
  return {
    file_object_id: parseUuid(input.file_object_id),
    sha256: input.sha256,
    byte_size: size,
    mime_type: input.mime_type,
  };
}

function parsePreview(value: unknown, extraKeys: string[] = []): AmicOsVaultPreviewInput {
  const input = object(value);
  exactKeys(input, ['principal', 'lawos_matter_id', 'requested_exact_version', ...extraKeys]);
  const exact = object(input.requested_exact_version);
  exactKeys(exact, ['document_id', 'version_id', 'file_object_id', 'sha256', 'byte_size', 'mime_type']);
  const mappedMatterId = matterId(input.lawos_matter_id);
  if (!mappedMatterId) throw invalid();
  return {
    accountLedgerId: principalAccountLedgerId(input.principal),
    lawosMatterId: mappedMatterId,
    exact: { document_id: parseUuid(exact.document_id), version_id: parseUuid(exact.version_id), ...previewFileFields(exact) },
  };
}

function parsePreviewFile(value: unknown): AmicOsVaultPreviewFile {
  const input = object(value);
  exactKeys(input, ['file_object_id', 'sha256', 'byte_size', 'mime_type']);
  const file = previewFileFields(input);
  if (file.mime_type !== 'application/pdf') throw invalid();
  return { ...file, mime_type: 'application/pdf' };
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/read')
export class AmicOsVaultReadController {
  constructor(
    @Inject(AmicOsVaultReadService)
    private readonly service: AmicOsVaultReadService,
  ) {}

  @Post('documents')
  list(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultReadResponse> {
    return this.service.list(principal(request), parseList(body));
  }

  @Post('folders')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  folders(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.folders(principal(request), parseFolders(body));
  }

  @Post('search')
  search(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultReadResponse> {
    return this.service.search(principal(request), parseSearch(body));
  }

  @Post('versions')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  versions(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultVersionReadResponse> {
    return this.service.versions(principal(request), parseVersions(body));
  }

  @Post('portal-document')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  portalDocument(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    const value = object(body);
    exactKeys(value, ['principal', 'lawos_matter_id', 'document_id']);
    const mappedMatterId = matterId(value.lawos_matter_id);
    if (!mappedMatterId) throw invalid();
    return this.service.portalDocument(principal(request), {
      accountLedgerId: principalAccountLedgerId(value.principal),
      lawosMatterId: mappedMatterId, documentId: parseUuid(value.document_id),
    });
  }

  @Post('latest')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  latest(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
  ): Promise<AmicOsVaultLatestReadResponse> {
    const value = object(body);
    exactKeys(value, ['principal', 'lawos_matter_id', 'document_id']);
    const mappedMatterId = matterId(value.lawos_matter_id);
    if (!mappedMatterId) throw invalid();
    return this.service.latest(principal(request), {
      accountLedgerId: principalAccountLedgerId(value.principal),
      lawosMatterId: mappedMatterId,
      documentId: parseUuid(value.document_id),
    });
  }

  @Post('preview-prepare')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  preparePreview(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    const input = parsePreview(body, ['enqueue']);
    const enqueue = object(body).enqueue;
    if (typeof enqueue !== 'boolean') throw invalid();
    return this.service.preparePreview(principal(request), input, enqueue);
  }

  @Post('preview-sessions')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  issuePreviewSession(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.issuePreviewSession(principal(request), parsePreview(body));
  }

  @Post('preview-chunk')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  previewChunk(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    const input = parsePreview(body, ['preview_session_id', 'token', 'preview', 'offset']);
    const raw = object(body);
    if (typeof raw.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(raw.token)
        || !Number.isSafeInteger(raw.offset) || Number(raw.offset) < 0
        || Number(raw.offset) % PREVIEW_CHUNK_BYTES !== 0) throw invalid();
    return this.service.previewChunk(principal(request), {
      ...input,
      previewSessionId: parseUuid(raw.preview_session_id),
      token: raw.token,
      preview: parsePreviewFile(raw.preview),
      offset: Number(raw.offset),
    });
  }
}
