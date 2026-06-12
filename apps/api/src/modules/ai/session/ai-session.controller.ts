import { BadRequestException, Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiSessionLogService } from './ai-session-log.service';

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

@Controller('ai/sessions')
export class AiSessionController {
  constructor(@Inject(AiSessionLogService) private readonly sessions: AiSessionLogService) {}

  @Get(':sessionId')
  getSession(@Req() request: RequestWithSession, @Param('sessionId') sessionId: string) {
    if (!uuidPattern.test(sessionId)) throw validationFailed();
    return this.sessions.getSessionDetail(sessionParts(request), sessionId);
  }
}
