import { BadRequestException, Body, Controller, Inject, Post, Req } from '@nestjs/common';
import {
  aiCitationSourceRequestSchema,
  aiCitationVerificationRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../../auth/session.guard';
import { AiCitationMapperService } from './citation-mapper.service';
import { AiCitationVerifier } from './citation-verifier';

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

@Controller('ai/citations')
export class AiCitationController {
  constructor(
    @Inject(AiCitationMapperService)
    private readonly citationMapper: AiCitationMapperService,
    @Inject(AiCitationVerifier) private readonly citationVerifier: AiCitationVerifier,
  ) {}

  @Post('sources')
  resolveSources(@Req() request: RequestWithSession, @Body() body: unknown) {
    const parsed = aiCitationSourceRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.citationMapper.resolveSources(sessionParts(request), parsed.data);
  }

  @Post('verify')
  verify(@Body() body: unknown) {
    const parsed = aiCitationVerificationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw validationFailed();
    return this.citationVerifier.verify(parsed.data);
  }
}
