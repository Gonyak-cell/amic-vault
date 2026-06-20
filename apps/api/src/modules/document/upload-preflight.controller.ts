import { BadRequestException, Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import { createUploadPreflightRequestSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { TenantContextService } from '../tenant/tenant-context';
import { MatterSourcePolicyService } from '../integrations/matter-app/matter-source-policy';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function parseBody(body: unknown) {
  try {
    return createUploadPreflightRequestSchema.parse(body ?? {});
  } catch {
    throw validationFailed();
  }
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('matters/:matterId/documents/upload-preflight')
export class UploadPreflightController {
  constructor(
    @Inject(MatterSourcePolicyService)
    private readonly matterSourcePolicy: MatterSourcePolicyService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  create(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    parseBody(body);
    return this.matterSourcePolicy.createUploadPreflight({
      actorUserId: sessionUserId(request),
      matterId: parseUuid(matterId),
      tenantId: this.tenantContext.require().tenantId,
    });
  }
}
