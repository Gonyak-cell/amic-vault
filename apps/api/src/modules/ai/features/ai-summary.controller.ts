import { BadRequestException, Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { aiSummaryRequestSchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiSummaryService } from './ai-summary.service';

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

@Controller('ai/summaries')
export class AiSummaryController {
  constructor(@Inject(AiSummaryService) private readonly summaries: AiSummaryService) {}

  @Post()
  createSummary(@Req() request: RequestWithSession, @Body() body: unknown) {
    const parsed = aiSummaryRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.summaries.createSummary(sessionParts(request), parsed.data);
  }
}
