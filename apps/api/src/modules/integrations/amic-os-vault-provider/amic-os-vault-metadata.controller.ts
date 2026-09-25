import { BadRequestException, Body, Controller, Header, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import {
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultMetadataService, type VaultMetadataUpdateInput } from './amic-os-vault-metadata.service';

const safeRef = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const accountLedgerId = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const metadataCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const controls = /[\u0000-\u001f\u007f]/u;

function invalid(): BadRequestException {
  return new BadRequestException({ code: 'DMS_METADATA_INVALID' });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, required: string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw invalid();
}

function common(value: unknown): { accountLedgerId: string; documentId: string } {
  const body = record(value);
  const asserted = record(body.principal);
  keys(asserted, ['tenant_id', 'user_id']);
  if (typeof asserted.tenant_id !== 'string' || !safeRef.test(asserted.tenant_id)
      || typeof asserted.user_id !== 'string' || !accountLedgerId.test(asserted.user_id.trim().toLowerCase())
      || typeof body.document_id !== 'string' || !uuid.test(body.document_id)) throw invalid();
  return { accountLedgerId: asserted.user_id.trim().toLowerCase(), documentId: body.document_id.toLowerCase() };
}

function parseRead(value: unknown) {
  const body = record(value);
  keys(body, ['principal', 'document_id']);
  return common(body);
}

function parseUpdate(value: unknown): VaultMetadataUpdateInput {
  const body = record(value);
  keys(body, ['principal', 'document_id', 'expected_revision', 'filename', 'metadata_code', 'business_info']);
  const scope = common(body);
  const business = record(body.business_info);
  keys(business, ['description', 'document_type', 'tags']);
  const validText = (text: unknown, max: number) => text === null || typeof text === 'string'
    && text === text.normalize('NFC').trim() && text.length <= max && !controls.test(text);
  if (!Number.isSafeInteger(body.expected_revision) || Number(body.expected_revision) < 0
      || typeof body.filename !== 'string' || !body.filename
      || body.filename !== body.filename.normalize('NFC').trim()
      || body.filename.length > 240 || /[\\/\u0000-\u001f\u007f]/u.test(body.filename)
      || body.metadata_code !== null && (typeof body.metadata_code !== 'string'
        || !metadataCode.test(body.metadata_code))
      || !validText(business.description, 2_000)
      || !validText(business.document_type, 80)
      || !Array.isArray(business.tags) || business.tags.length > 20
      || business.tags.some((tag: unknown) => typeof tag !== 'string' || !tag
        || tag !== tag.normalize('NFC').trim() || tag.length > 64 || controls.test(tag))
      || new Set(business.tags).size !== business.tags.length) throw invalid();
  const filename = body.filename as string;
  return {
    ...scope,
    expectedRevision: Number(body.expected_revision),
    filename,
    metadataCode: body.metadata_code as string | null,
    businessInfo: {
      description: business.description as string | null,
      document_type: business.document_type as string | null,
      tags: business.tags as string[],
    },
  };
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/metadata')
export class AmicOsVaultMetadataController {
  constructor(@Inject(AmicOsVaultMetadataService) private readonly service: AmicOsVaultMetadataService) {}

  private principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
    if (!request.amicOsVaultPrincipal) throw invalid();
    return request.amicOsVaultPrincipal;
  }

  @Post('read')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  read(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.read(this.principal(request), parseRead(body));
  }

  @Post('update')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  update(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.update(this.principal(request), parseUpdate(body));
  }
}
