import { unlink } from 'node:fs/promises';
import { Body, Controller, Inject, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../auth/public.decorator';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import { multipartUploadOptions } from '../../document/multipart.config';
import { ClientDocumentAuthorityContext } from '../../permission/client-document-authority';
import { AmicOsVaultProviderConfig, AmicOsVaultProviderGuard, type RequestWithAmicOsVaultProvider } from './amic-os-vault-provider.guard';
import { clientDocumentAuthority, parseClientDocumentEnvelope, maxClientDocumentBytes, type ClientDocumentOperation } from './amic-os-vault-client.contract';
import { AmicOsVaultClientService } from './amic-os-vault-client.service';

type Response = { status(code: number): unknown; setHeader(name: string, value: string): unknown };
const multipart = multipartUploadOptions();
multipart.limits.fileSize = maxClientDocumentBytes;
multipart.limits.fields = 1;
multipart.limits.parts = 2;
multipart.limits.fieldSize = 16 * 1024;

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/client-documents/v1')
export class AmicOsVaultClientController {
  constructor(
    @Inject(AmicOsVaultClientService) private readonly service: AmicOsVaultClientService,
    @Inject(AmicOsVaultProviderConfig) private readonly config: AmicOsVaultProviderConfig,
    @Inject(ClientDocumentAuthorityContext) private readonly authority: ClientDocumentAuthorityContext,
  ) {}
  @Post('workspaces/resolve')
  workspace(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('workspaces/resolve', request, body, response);
  }
  @Post('documents/list')
  list(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('documents/list', request, body, response);
  }
  @Post('uploads/stage')
  @UseInterceptors(FileInterceptor('file', multipart))
  async stage(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown,
    @Res({ passthrough: true }) response: Response, @UploadedFile() file?: UploadedDiskFile) {
    try {
      const fields = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
      if (Object.keys(fields).length !== 1 || typeof fields.envelope !== 'string') throw new BadRequestException({ code: 'VALIDATION_FAILED' });
      let parsed: unknown;
      try { parsed = JSON.parse(fields.envelope); } catch { throw new BadRequestException({ code: 'VALIDATION_FAILED' }); }
      return await this.execute('uploads/stage', request, parsed, response, file);
    } finally {
      if (file?.path) await unlink(file.path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  @Post('uploads/complete')
  complete(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('uploads/complete', request, body, response);
  }
  @Post('uploads/readback')
  readback(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('uploads/readback', request, body, response);
  }
  @Post('documents/versions')
  versions(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('documents/versions', request, body, response);
  }
  @Post('documents/download')
  download(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('documents/download', request, body, response);
  }
  @Post('metadata/read')
  metadata(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('metadata/read', request, body, response);
  }
  @Post('metadata/update')
  update(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('metadata/update', request, body, response);
  }
  @Post('dlp/assessments/read')
  assessment(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('dlp/assessments/read', request, body, response);
  }
  @Post('dlp/reviews/create')
  review(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.execute('dlp/reviews/create', request, body, response);
  }
  private async execute(operation: ClientDocumentOperation, request: RequestWithAmicOsVaultProvider,
    body: unknown, response: Response, file?: UploadedDiskFile) {
    if (!request.amicOsVaultPrincipal) throw new Error('AMIC OS provider principal unavailable');
    const envelope = parseClientDocumentEnvelope(body, operation);
    const authority = clientDocumentAuthority(request.amicOsVaultPrincipal, envelope, this.config);
    const result = await this.authority.run(authority, () => this.service.execute(operation, envelope, file));
    response.status(result.status);
    response.setHeader('Cache-Control', 'no-store');
    return result.body;
  }
}
