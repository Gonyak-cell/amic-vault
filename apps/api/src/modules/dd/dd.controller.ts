import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createDdDataRoomMappingRequestSchema,
  createDdExportJobRequestSchema,
  createDdIssueRequestSchema,
  createDdNegotiationIssueExportRequestSchema,
  createDdReportExportRequestSchema,
  createDdRfiRequestSchema,
  createDdRiskRequestSchema,
  ddRfiGapQuerySchema,
  ddIssueCitationRequiredReason,
  ddDataRoomMappingQuerySchema,
  ddRfiTemplateInstantiateRequestSchema,
  ddIssueQuerySchema,
  ddRfiQuerySchema,
  ddRiskQuerySchema,
  ddTraceabilityQuerySchema,
  reviewDdMappingSuggestionRequestSchema,
  updateDdIssueRequestSchema,
  updateDdRfiRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { DdExportQueueService } from './dd-export-queue.service';
import { DdService } from './dd.service';

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', ...(reason ? { reason } : {}) });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw validationFailed(parseValidationReason(error, [ddIssueCitationRequiredReason]));
  }
}

function parseValidationReason(error: unknown, allowedReasons: readonly string[]): string | undefined {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return undefined;
  const issues = (error as { issues?: Array<{ message?: unknown }> }).issues;
  if (!Array.isArray(issues)) return undefined;
  return allowedReasons.find((reason) =>
    issues.some((issue) => issue.message === reason),
  );
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

@Controller('dd')
export class DdController {
  constructor(
    @Inject(DdService) private readonly dd: DdService,
    @Inject(DdExportQueueService) private readonly exportQueue: DdExportQueueService,
  ) {}

  @Post('rfis')
  createRfi(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdRfiRequestSchema.parse(body ?? {}));
    return this.dd.createRfi(permissionContext(request), input);
  }

  @Get('rfis')
  listRfis(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddRfiQuerySchema.parse(query));
    return this.dd.listRfis(permissionContext(request), input);
  }

  @Get('rfi-gaps')
  listRfiGaps(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddRfiGapQuerySchema.parse(query));
    return this.dd.listRfiGaps(permissionContext(request), input);
  }

  @Post('rfi-templates/:templateId/instantiate')
  instantiateRfiTemplate(
    @Req() request: RequestWithSession,
    @Param('templateId') templateId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => ddRfiTemplateInstantiateRequestSchema.parse(body ?? {}));
    return this.dd.instantiateRfiTemplate(permissionContext(request), parseUuidParam(templateId), input);
  }

  @Patch('rfis/:rfiId')
  updateRfi(
    @Req() request: RequestWithSession,
    @Param('rfiId') rfiId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateDdRfiRequestSchema.parse(body ?? {}));
    return this.dd.updateRfi(permissionContext(request), parseUuidParam(rfiId), input);
  }

  @Post('data-room-mappings')
  createMapping(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createDdDataRoomMappingRequestSchema.parse(body ?? {}),
    );
    return this.dd.createMapping(permissionContext(request), input);
  }

  @Get('data-room-mappings')
  listMappings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddDataRoomMappingQuerySchema.parse(query));
    return this.dd.listMappings(permissionContext(request), input);
  }

  @Patch('data-room-mappings/:mappingId/review')
  reviewMappingSuggestion(
    @Req() request: RequestWithSession,
    @Param('mappingId') mappingId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => reviewDdMappingSuggestionRequestSchema.parse(body ?? {}));
    return this.dd.reviewMappingSuggestion(permissionContext(request), parseUuidParam(mappingId), input);
  }

  @Post('issues')
  createIssue(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdIssueRequestSchema.parse(body ?? {}));
    return this.dd.createIssue(permissionContext(request), input);
  }

  @Patch('issues/:issueId')
  updateIssue(
    @Req() request: RequestWithSession,
    @Param('issueId') issueId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrValidation(() => updateDdIssueRequestSchema.parse(body ?? {}));
    return this.dd.updateIssue(permissionContext(request), parseUuidParam(issueId), input);
  }

  @Get('issues')
  listIssues(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddIssueQuerySchema.parse(query));
    return this.dd.listIssues(permissionContext(request), input);
  }

  @Post('risks')
  createRisk(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdRiskRequestSchema.parse(body ?? {}));
    return this.dd.createRisk(permissionContext(request), input);
  }

  @Get('risks')
  listRisks(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddRiskQuerySchema.parse(query));
    return this.dd.listRisks(permissionContext(request), input);
  }

  @Get('traceability')
  traceability(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => ddTraceabilityQuerySchema.parse(query));
    return this.dd.traceability(permissionContext(request), input);
  }

  @Post('report-export')
  exportReport(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdReportExportRequestSchema.parse(body ?? {}));
    return this.dd.exportReport(permissionContext(request), input);
  }

  @Post('negotiation-issue-export')
  exportNegotiationIssues(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createDdNegotiationIssueExportRequestSchema.parse(body ?? {}),
    );
    return this.dd.exportNegotiationIssues(permissionContext(request), input);
  }

  @Post('export-jobs')
  createExportJob(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdExportJobRequestSchema.parse(body ?? {}));
    return this.exportQueue.enqueueFromRequest(permissionContext(request), input);
  }
}
