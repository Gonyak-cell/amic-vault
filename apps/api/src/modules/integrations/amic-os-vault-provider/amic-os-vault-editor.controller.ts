import { unlink } from 'node:fs/promises';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../auth/public.decorator';
import { multipartFieldName, multipartUploadOptions } from '../../document/multipart.config';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import {
  parseAmicOsVaultOfficeCancelInput,
  parseAmicOsVaultOfficeCopyBindingInput,
  parseAmicOsVaultOfficeCopyCreateInput,
  parseAmicOsVaultOfficeCopyListInput,
  parseAmicOsVaultOfficeHeartbeatInput,
  parseAmicOsVaultOfficeInfoInput,
  parseAmicOsVaultOfficeOpenInput,
  parseAmicOsVaultOfficeRecoverInput,
  parseAmicOsVaultOfficeRecoveryStatusInput,
  parseAmicOsVaultOfficeSaveInput,
  parseAmicOsVaultOfficeSourceInput,
  parseAmicOsVaultOfficeStatusInput,
} from './amic-os-vault-editor.contract';
import { AmicOsVaultEditorService } from './amic-os-vault-editor.service';
import {
  parseAmicOsVaultNativeCopyBindingInput,
  parseAmicOsVaultNativeCopyListInput,
  parseAmicOsVaultNativeCopyPrepareInput,
  parseAmicOsVaultNativeCopyReadInput,
} from './amic-os-vault-document-copy.contract';
import { AmicOsVaultDocumentCopyService } from './amic-os-vault-document-copy.service';
import {
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';

const maxEnvelopeBytes = 128 * 1024;

function principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
  if (!request.amicOsVaultPrincipal) throw new Error('AMIC OS Vault provider principal is unavailable');
  return request.amicOsVaultPrincipal;
}

function multipartEnvelope(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.envelope !== 'string') return body;
  if (Buffer.byteLength(input.envelope, 'utf8') > maxEnvelopeBytes) return body;
  try {
    return JSON.parse(input.envelope) as unknown;
  } catch {
    return body;
  }
}

async function removeUploadedFile(file: UploadedDiskFile | undefined): Promise<void> {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/edit')
export class AmicOsVaultEditorController {
  constructor(
    @Inject(AmicOsVaultEditorService) private readonly service: AmicOsVaultEditorService,
    @Inject(AmicOsVaultDocumentCopyService)
    private readonly documentCopyService: AmicOsVaultDocumentCopyService,
  ) {}

  @Post('info')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  info(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.info(principal(request), parseAmicOsVaultOfficeInfoInput(body));
  }

  @Post('open')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  open(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.open(principal(request), parseAmicOsVaultOfficeOpenInput(body));
  }

  @Post('source')
  @HttpCode(200)
  async source(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const source = await this.service.source(
      principal(request),
      parseAmicOsVaultOfficeSourceInput(body),
    );
    response.setHeader('content-type', source.contentType);
    response.setHeader('content-length', String(source.contentLength));
    response.setHeader('content-disposition', contentDisposition(source.filename));
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-amic-sha256', source.sha256);
    response.setHeader('cache-control', 'private, no-store');
    return new StreamableFile(source.body);
  }

  @Post('heartbeat')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  heartbeat(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.heartbeat(principal(request), parseAmicOsVaultOfficeHeartbeatInput(body));
  }

  @Post('status')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  status(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.status(principal(request), parseAmicOsVaultOfficeStatusInput(body));
  }

  @Post('save')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async save(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.service.save(
        principal(request),
        parseAmicOsVaultOfficeSaveInput(multipartEnvelope(body)),
        file,
      );
    } finally {
      await removeUploadedFile(file);
    }
  }

  @Post('cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  cancel(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.cancel(principal(request), parseAmicOsVaultOfficeCancelInput(body));
  }

  @Post('recovery')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  recovery(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.recovery(principal(request), parseAmicOsVaultOfficeRecoveryStatusInput(body));
  }

  @Post('recover')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  recover(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.recover(principal(request), parseAmicOsVaultOfficeRecoverInput(body));
  }

  @Post('copy/create')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  createCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.createCopy(principal(request), parseAmicOsVaultOfficeCopyCreateInput(body));
  }

  @Post('copy/retain')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  retainCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.retainCopy(principal(request), parseAmicOsVaultOfficeCopyBindingInput(body));
  }

  @Post('copy/commit')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  commitCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.commitCopy(principal(request), parseAmicOsVaultOfficeCopyBindingInput(body));
  }

  @Post('copy/list')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  listCopies(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.listCopies(principal(request), parseAmicOsVaultOfficeCopyListInput(body));
  }

  @Post('document-copy/prepare')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  prepareDocumentCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.documentCopyService.prepare(
      principal(request),
      parseAmicOsVaultNativeCopyPrepareInput(body),
    );
  }

  @Post('document-copy/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  completeDocumentCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.documentCopyService.complete(
      principal(request),
      parseAmicOsVaultNativeCopyBindingInput(body),
    );
  }

  @Post('document-copy/list')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  listDocumentCopies(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.documentCopyService.list(
      principal(request),
      parseAmicOsVaultNativeCopyListInput(body),
    );
  }

  @Post('document-copy/read')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  readDocumentCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.documentCopyService.read(
      principal(request),
      parseAmicOsVaultNativeCopyReadInput(body),
    );
  }

  @Post('document-copy/commit')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  commitDocumentCopy(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.documentCopyService.commit(
      principal(request),
      parseAmicOsVaultNativeCopyBindingInput(body),
    );
  }
}
