import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import {
  parseAmicOsVaultExportAuthorizeInput,
  parseAmicOsVaultExportDownloadInput,
  parseAmicOsVaultExportReadbackInput,
} from './amic-os-vault-provider.contract';
import {
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultProviderService } from './amic-os-vault-provider.service';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

function principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
  if (!request.amicOsVaultPrincipal) {
    throw new Error('AMIC OS Vault provider principal is unavailable');
  }
  return request.amicOsVaultPrincipal;
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document';
  const encoded = encodeURIComponent(filename).replace(/['()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/exports')
export class AmicOsVaultProviderController {
  constructor(
    @Inject(AmicOsVaultProviderService)
    private readonly service: AmicOsVaultProviderService,
  ) {}

  @Post('authorize')
  authorize(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.authorize(
      principal(request),
      parseAmicOsVaultExportAuthorizeInput(body),
    );
  }

  @Post('download')
  async download(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: HeaderResponse,
  ) {
    const result = await this.service.download(
      principal(request),
      parseAmicOsVaultExportDownloadInput(body),
    );
    const metadata = result.metadata;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', metadata.exact_version.mime_type);
    response.setHeader('content-length', String(result.body.byteLength));
    response.setHeader('content-disposition', contentDisposition(metadata.attachment_name));
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-amic-vault-authority-kind', metadata.authority_kind);
    response.setHeader('x-amic-vault-authority-ref', metadata.authority_ref);
    response.setHeader('x-amic-vault-provider-revision', metadata.provider_revision);
    response.setHeader('x-amic-vault-export-ref', metadata.provider_export_ref);
    response.setHeader('x-amic-vault-document-id', metadata.exact_version.document_id);
    response.setHeader('x-amic-vault-version-id', metadata.exact_version.version_id);
    response.setHeader('x-amic-vault-file-object-id', metadata.exact_version.file_object_id);
    response.setHeader('x-amic-vault-sha256', metadata.exact_version.sha256);
    response.setHeader('x-amic-vault-byte-size', String(metadata.exact_version.byte_size));
    response.setHeader('x-amic-vault-audit-event-id', metadata.audit.event_id);
    response.setHeader('x-amic-vault-correlation-id', metadata.audit.correlation_id);
    return new StreamableFile(result.body);
  }

  @Post('readback')
  readback(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.readback(
      principal(request),
      parseAmicOsVaultExportReadbackInput(body),
    );
  }
}
