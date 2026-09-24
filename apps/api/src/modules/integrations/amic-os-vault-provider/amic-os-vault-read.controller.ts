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
  AmicOsVaultPreviewInput,
  AmicOsVaultPreviewFile,
} from './amic-os-vault-read.service';
import { isOfficePreviewMimeType, PREVIEW_CHUNK_BYTES } from '../../preview/preview.service';
import { PREVIEW_MAX_INPUT_BYTES } from '../../preview/preview-convert.job';

const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const date = /^\d{4}-\d{2}-\d{2}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
  ]);
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const dateFrom = optionalDate(input.date_from);
  const dateTo = optionalDate(input.date_to);
  if (query.length > 2_000
      || input.current_version_only !== true
      || (dateFrom && dateTo && dateFrom > dateTo)) throw invalid();
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
    dateFrom,
    dateTo,
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
