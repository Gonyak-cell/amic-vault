import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  createLitigationEvidenceRequestSchema,
  createLitigationFactRequestSchema,
  createLitigationIssueRequestSchema,
  createLitigationPleadingRequestSchema,
  litigationCaseMapQuerySchema,
  litigationEvidenceQuerySchema,
  litigationFactQuerySchema,
  litigationIssueQuerySchema,
  litigationPleadingQuerySchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { LitigationService } from './litigation.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    throw validationFailed();
  }
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

@Controller('litigation')
export class LitigationController {
  constructor(@Inject(LitigationService) private readonly litigation: LitigationService) {}

  @Post('evidence')
  createEvidence(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createLitigationEvidenceRequestSchema.parse(body ?? {}),
    );
    return this.litigation.createEvidence(permissionContext(request), input);
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

  @Post('pleadings')
  createPleading(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() =>
      createLitigationPleadingRequestSchema.parse(body ?? {}),
    );
    return this.litigation.createPleading(permissionContext(request), input);
  }

  @Get('pleadings')
  listPleadings(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationPleadingQuerySchema.parse(query));
    return this.litigation.listPleadings(permissionContext(request), input);
  }

  @Get('case-map')
  caseMap(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    const input = parseOrValidation(() => litigationCaseMapQuerySchema.parse(query));
    return this.litigation.caseMap(permissionContext(request), input);
  }
}
