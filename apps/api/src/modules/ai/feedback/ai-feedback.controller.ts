import { BadRequestException, Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import { aiFeedbackRequestSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiFeedbackService } from './ai-feedback.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

@Controller('ai/feedback')
export class AiFeedbackController {
  constructor(@Inject(AiFeedbackService) private readonly feedback: AiFeedbackService) {}

  @Post()
  recordFeedback(@Req() request: RequestWithSession, @Body() body: unknown) {
    const parsed = aiFeedbackRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.feedback.recordFeedback(sessionParts(request), parsed.data);
  }

  @Get('metrics')
  getMetrics(@Req() request: RequestWithSession, @Query('matterId') matterId?: string) {
    if (matterId !== undefined && !uuidPattern.test(matterId)) throw validationFailed();
    return this.feedback.getPilotMetrics(sessionParts(request), matterId ?? null);
  }
}
