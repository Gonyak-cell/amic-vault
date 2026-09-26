import { BadRequestException, Body, Controller, Header, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { AmicOsVaultProviderGuard, type RequestWithAmicOsVaultProvider } from './amic-os-vault-provider.guard';
import { AmicOsVaultOcrService, type OcrCorrectionInput } from './amic-os-vault-ocr.service';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const digest = /^[a-f0-9]{64}$/u;

function invalid(): BadRequestException { return new BadRequestException({ code: 'DMS_OCR_INVALID' }); }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  return value as Record<string, unknown>;
}

function keys(input: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(input).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((value, index) => value !== wanted[index])) throw invalid();
}

function parseScope(value: unknown, expected: string[]) {
  const input = record(value);
  keys(input, expected);
  const principal = record(input.principal);
  keys(principal, ['tenant_id', 'user_id']);
  if (typeof principal.tenant_id !== 'string' || !safeRef.test(principal.tenant_id)
      || typeof principal.user_id !== 'string' || !accountId.test(principal.user_id)
      || typeof input.document_id !== 'string' || !uuid.test(input.document_id)
      || typeof input.lawos_matter_id !== 'string' || !safeRef.test(input.lawos_matter_id)) throw invalid();
  return { accountLedgerId: principal.user_id, documentId: input.document_id.toLowerCase(),
    lawosMatterId: input.lawos_matter_id, input };
}

function parseRead(value: unknown) {
  const parsed = parseScope(value, ['principal', 'document_id', 'lawos_matter_id', 'page_offset']);
  const pageOffset = parsed.input.page_offset;
  if (!Number.isSafeInteger(pageOffset) || Number(pageOffset) < 0 || Number(pageOffset) > 200) throw invalid();
  return { accountLedgerId: parsed.accountLedgerId, documentId: parsed.documentId,
    lawosMatterId: parsed.lawosMatterId, pageOffset: Number(pageOffset) };
}

function parseCorrection(value: unknown): OcrCorrectionInput {
  const parsed = parseScope(value, ['principal', 'document_id', 'lawos_matter_id', 'page_number',
    'source_revision', 'source_result_sha256', 'expected_correction_revision', 'corrected_text']);
  const input = parsed.input;
  if (!Number.isSafeInteger(input.page_number) || Number(input.page_number) < 1
      || Number(input.page_number) > 200 || !Number.isSafeInteger(input.source_revision)
      || Number(input.source_revision) < 1 || typeof input.source_result_sha256 !== 'string'
      || !digest.test(input.source_result_sha256)
      || !Number.isSafeInteger(input.expected_correction_revision)
      || Number(input.expected_correction_revision) < 0
      || typeof input.corrected_text !== 'string' || input.corrected_text.length > 1_000_000
      || input.corrected_text.includes('\0')) throw invalid();
  return { accountLedgerId: parsed.accountLedgerId, documentId: parsed.documentId,
    lawosMatterId: parsed.lawosMatterId, pageNumber: Number(input.page_number),
    sourceRevision: Number(input.source_revision), sourceResultSha256: input.source_result_sha256,
    expectedCorrectionRevision: Number(input.expected_correction_revision), correctedText: input.corrected_text };
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/ocr')
export class AmicOsVaultOcrController {
  constructor(@Inject(AmicOsVaultOcrService) private readonly service: AmicOsVaultOcrService) {}

  @Post('pages')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  pages(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    if (!request.amicOsVaultPrincipal) throw invalid();
    return this.service.read(request.amicOsVaultPrincipal, parseRead(body));
  }

  @Post('correct')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  correct(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    if (!request.amicOsVaultPrincipal) throw invalid();
    return this.service.correct(request.amicOsVaultPrincipal, parseCorrection(body));
  }
}
