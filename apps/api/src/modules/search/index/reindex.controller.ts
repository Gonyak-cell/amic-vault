import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequireRoles } from '../../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../../auth/session.guard';
import { ReindexService, type ReindexRequestInput } from './reindex.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw permissionDenied();
  return userId;
}

function parseReindexRequest(body: unknown): ReindexRequestInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw validationFailed();
  const input = body as Record<string, unknown>;
  if (input.scopeType === 'tenant') {
    return { scopeType: 'tenant', scopeId: null };
  }
  if (
    input.scopeType === 'matter' &&
    typeof input.scopeId === 'string' &&
    uuidPattern.test(input.scopeId)
  ) {
    return { scopeType: 'matter', scopeId: input.scopeId };
  }
  throw validationFailed();
}

@Controller('admin/search/reindex')
export class ReindexController {
  constructor(@Inject(ReindexService) private readonly reindexService: ReindexService) {}

  @Post()
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  requestReindex(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.reindexService.requestReindex(sessionUserId(request), parseReindexRequest(body));
  }
}
