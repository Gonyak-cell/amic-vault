import { BadRequestException, Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import {
  createUploadPreflightRequestSchema,
  type UploadDuplicateCandidateDto,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { TenantContextService } from '../tenant/tenant-context';
import { MatterSourcePolicyService } from '../integrations/matter-app/matter-source-policy';
import { PermissionService } from '../permission/permission.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    @Inject(DuplicateDetectorService)
    private readonly duplicateDetector: DuplicateDetectorService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  async create(
    @Req() request: RequestWithSession,
    @Param('matterId') matterId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(body);
    const tenantId = this.tenantContext.require().tenantId;
    const matterReference = parseUuid(matterId);
    const preflight = await this.matterSourcePolicy.createUploadPreflight({
      actorUserId: sessionUserId(request),
      matterId: matterReference,
      tenantId,
    });
    if (!input.sha256) return preflight;
    const rawCandidates = await this.duplicateDetector.findSafeUploadCandidates({
      tenantId,
      matterId: matterReference,
      sha256: input.sha256,
    });
    const actorUserId = sessionUserId(request);
    const duplicateCandidates: UploadDuplicateCandidateDto[] = [];
    for (const candidate of rawCandidates) {
      const decision = await this.permissionService
        .canReadDocument({ tenantId, userId: actorUserId }, candidate.documentReference)
        .catch(() => undefined);
      if (decision?.effect === 'ALLOW') duplicateCandidates.push(candidate);
    }
    return {
      ...preflight,
      duplicateCandidates,
      duplicateDecisionRequired: rawCandidates.length > 0,
    };
  }
}
