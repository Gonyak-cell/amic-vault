import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { aiPrepFeedbackRequestSchema } from '@amic-vault/shared';
import { RequireRoles } from '../../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiPrepStatusService } from './ai-prep-status.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
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

@Controller()
export class AiPrepStatusController {
  constructor(@Inject(AiPrepStatusService) private readonly status: AiPrepStatusService) {}

  @Get('documents/:documentId/ai-prep')
  getDocumentPrepStatus(@Req() request: RequestWithSession, @Param('documentId') documentId: string) {
    return this.status.getDocumentStatus(sessionParts(request), parseUuid(documentId));
  }

  @Post('ai/prep/feedback')
  recordPrepFeedback(@Req() request: RequestWithSession, @Body() body: unknown) {
    const parsed = aiPrepFeedbackRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.status.recordArtifactFeedback(sessionParts(request), parsed.data);
  }

  @Get('matters/:matterId/ai-prep')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  getMatterPrepReadiness(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.status.getMatterReadiness(sessionParts(request), parseUuid(matterId));
  }

  @Post('matters/:matterId/ai-prep/retry')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  retryMatterPrep(@Req() request: RequestWithSession, @Param('matterId') matterId: string) {
    return this.status.retryMatterPrep(sessionParts(request), parseUuid(matterId));
  }
}
