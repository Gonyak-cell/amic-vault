import { BadRequestException, Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiOpsService } from './ai-ops.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function sessionParts(request: RequestWithSession): {
  tenantId: string;
  userId: string;
  sessionId: string;
} {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw validationFailed();
  return { tenantId, userId, sessionId };
}

@Controller('ai/ops')
@RequireRoles('firm_admin', 'security_admin')
@UseGuards(RequireRolesGuard)
export class AiOpsController {
  constructor(@Inject(AiOpsService) private readonly ops: AiOpsService) {}

  @Get('health')
  getHealth(@Req() request: RequestWithSession) {
    return this.ops.getHealth(sessionParts(request));
  }

  @Get('metrics')
  getMetrics(@Req() request: RequestWithSession) {
    return this.ops.getMetrics(sessionParts(request));
  }
}
