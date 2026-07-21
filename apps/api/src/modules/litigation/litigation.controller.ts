import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createLitigationAiSuggestionRequestSchema,
  createLitigationEvidenceRequestSchema,
  createLitigationFactRequestSchema,
  createLitigationHearingRequestSchema,
  createLitigationIssueRequestSchema,
  createLitigationPleadingRequestSchema,
  litigationAiSuggestionQuerySchema,
  litigationFactCitationRequiredReason,
  litigationCaseMapQuerySchema,
  litigationEvidenceNextCodeQuerySchema,
  litigationEvidenceQuerySchema,
  litigationFactQuerySchema,
  litigationHearingQuerySchema,
  litigationIssueQuerySchema,
  litigationPleadingQuerySchema,
  updateLitigationFactRequestSchema,
  updateLitigationHearingRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { LitigationAiClassifierService } from './litigation-ai-classifier.service';
import { LitigationService } from './litigation.service';

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw validationFailed(parseValidationReason(error, [litigationFactCitationRequiredReason]));
  }
}

function parseValidationReason(
  error: unknown,
  allowedReasons: readonly string[],
): string | undefined {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return undefined;
  const issues = (error as { issues?: Array<{ message?: unknown }> }).issues;
  if (!Array.isArray(issues)) return undefined;
  return allowedReasons.find((reason) => issues.some((issue) => issue.message === reason));
}

function permissionContext(request: RequestWithSession): {
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

function parseUuidParam(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw validationFailed();
  }
  return value;
}

@Controller('litigation')
export class LitigationController {
  constructor(
    @Inject(LitigationService) private readonly litigation: LitigationService,
    @Inject(LitigationAiClassifierService)
    private readonly aiClassifier: LitigationAiClassifierService,
  ) {}

  @Post('evidence')
  createEvidence(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationEvidenceRequestSchema.parse(body ?? {}));
    return this.litigation.createEvidence(permissionContext(request), input);
  }

  @Get('evidence/next-code')
  nextEvidenceCode(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationEvidenceNextCodeQuerySchema.parse(query));
    return this.litigation.nextEvidenceCode(permissionContext(request), input);
  }

  @Get('evidence')
  listEvidence(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationEvidenceQuerySchema.parse(query));
    return this.litigation.listEvidence(permissionContext(request), input);
  }

  @Post('facts')
  createFact(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationFactRequestSchema.parse(body ?? {}));
    return this.litigation.createFact(permissionContext(request), input);
  }

  @Patch('facts/:factId')
  updateFact(
    @Req() request: RequestWithSession,
    @Param('factId') factId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateLitigationFactRequestSchema.parse(body ?? {}));
    return this.litigation.updateFact(permissionContext(request), parseUuidParam(factId), input);
  }

  @Get('facts')
  listFacts(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationFactQuerySchema.parse(query));
    return this.litigation.listFacts(permissionContext(request), input);
  }

  @Post('issues')
  createIssue(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationIssueRequestSchema.parse(body ?? {}));
    return this.litigation.createIssue(permissionContext(request), input);
  }

  @Get('issues')
  listIssues(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationIssueQuerySchema.parse(query));
    return this.litigation.listIssues(permissionContext(request), input);
  }

  @Post('ai-suggestions')
  createAiSuggestion(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationAiSuggestionRequestSchema.parse(body ?? {}));
    return this.aiClassifier.createSuggestion(permissionContext(request), input);
  }

  @Get('ai-suggestions')
  listAiSuggestions(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationAiSuggestionQuerySchema.parse(query));
    return this.aiClassifier.listSuggestions(permissionContext(request), input);
  }

  @Post('pleadings')
  createPleading(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationPleadingRequestSchema.parse(body ?? {}));
    return this.litigation.createPleading(permissionContext(request), input);
  }

  @Get('pleadings')
  listPleadings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationPleadingQuerySchema.parse(query));
    return this.litigation.listPleadings(permissionContext(request), input);
  }

  @Post('hearings')
  createHearing(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createLitigationHearingRequestSchema.parse(body ?? {}));
    return this.litigation.createHearing(permissionContext(request), input);
  }

  @Patch('hearings/:hearingId')
  updateHearing(
    @Req() request: RequestWithSession,
    @Param('hearingId') hearingId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateLitigationHearingRequestSchema.parse(body ?? {}));
    return this.litigation.updateHearing(permissionContext(request), parseUuidParam(hearingId), input);
  }

  @Delete('hearings/:hearingId')
  cancelHearing(@Req() request: RequestWithSession, @Param('hearingId') hearingId: string) {
    return this.litigation.cancelHearing(permissionContext(request), parseUuidParam(hearingId));
  }

  @Get('hearings')
  listHearings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationHearingQuerySchema.parse(query));
    return this.litigation.listHearings(permissionContext(request), input);
  }

  @Get('case-map')
  caseMap(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationCaseMapQuerySchema.parse(query));
    return this.litigation.caseMap(permissionContext(request), input);
  }
}
