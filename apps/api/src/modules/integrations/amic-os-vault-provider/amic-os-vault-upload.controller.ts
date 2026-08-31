import { unlink } from 'node:fs/promises';
import {
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../auth/public.decorator';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import { multipartFieldName, multipartUploadOptions } from '../../document/multipart.config';
import {
  parseAmicOsVaultCapabilityInput,
  parseAmicOsVaultUploadCommitInput,
  parseAmicOsVaultUploadCompleteInput,
  parseAmicOsVaultUploadPreflightInput,
  parseAmicOsVaultUploadPrepareInput,
  parseAmicOsVaultUploadReadbackInput,
} from './amic-os-vault-upload.contract';
import {
  AmicOsVaultProviderConfig,
  AmicOsVaultProviderGuard,
  type AmicOsVaultProviderPrincipal,
  type RequestWithAmicOsVaultProvider,
} from './amic-os-vault-provider.guard';
import { AmicOsVaultUploadService } from './amic-os-vault-upload.service';

const maxEnvelopeBytes = 128 * 1024;

function principal(request: RequestWithAmicOsVaultProvider): AmicOsVaultProviderPrincipal {
  if (!request.amicOsVaultPrincipal) {
    throw new Error('AMIC OS Vault provider principal is unavailable');
  }
  return request.amicOsVaultPrincipal;
}

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/capabilities')
export class AmicOsVaultCapabilityController {
  constructor(
    @Inject(AmicOsVaultProviderConfig)
    private readonly config: AmicOsVaultProviderConfig,
  ) {}

  @Post('resolve')
  resolve(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    const actor = principal(request);
    const input = parseAmicOsVaultCapabilityInput(body);
    if (input.principal.user_id !== actor.accountLedgerId) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return {
      authoritative: true,
      provider_state: 'ready',
      tenant_binding_state: 'bound',
      user_binding_state: 'bound',
      authority_ref: this.config.uploadAuthorityRef(),
      capabilities: {
        read: true,
        upload: true,
        download: true,
        attach: true,
        work: false,
        governance: false,
        audit: false,
      },
    };
  }
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

@Public()
@UseGuards(AmicOsVaultProviderGuard)
@Controller('integrations/amic-os/vault/uploads')
export class AmicOsVaultUploadController {
  constructor(
    @Inject(AmicOsVaultUploadService)
    private readonly service: AmicOsVaultUploadService,
  ) {}

  @Post('preflight')
  preflight(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.preflight(
      principal(request),
      parseAmicOsVaultUploadPreflightInput(body),
    );
  }

  @Post('commit')
  @UseInterceptors(FileInterceptor(multipartFieldName, multipartUploadOptions()))
  async commit(
    @Req() request: RequestWithAmicOsVaultProvider,
    @Body() body: unknown,
    @UploadedFile() file: UploadedDiskFile | undefined,
  ) {
    try {
      return await this.service.commit(
        principal(request),
        parseAmicOsVaultUploadCommitInput(multipartEnvelope(body)),
        file,
      );
    } finally {
      await removeUploadedFile(file);
    }
  }

  @Post('prepare')
  prepare(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.prepare(
      principal(request),
      parseAmicOsVaultUploadPrepareInput(body),
    );
  }

  @Post('complete')
  complete(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.complete(
      principal(request),
      parseAmicOsVaultUploadCompleteInput(body),
    );
  }

  @Post('readback')
  readback(@Req() request: RequestWithAmicOsVaultProvider, @Body() body: unknown) {
    return this.service.readback(
      principal(request),
      parseAmicOsVaultUploadReadbackInput(body),
    );
  }
}
