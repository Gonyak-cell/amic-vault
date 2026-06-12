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
  createDdIssueRequestSchema,
  createDdRfiRequestSchema,
  createDdRiskRequestSchema,
  ddDataRoomMappingQuerySchema,
  ddIssueQuerySchema,
  ddRfiQuerySchema,
  ddRiskQuerySchema,
  ddTraceabilityQuerySchema,
  updateDdRfiRequestSchema,
} from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { DdService } from './dd.service';

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

function parseUuidParam(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw validationFailed();
  }
  return value;
}

@Controller('dd')
export class DdController {
  constructor(@Inject(DdService) private readonly dd: DdService) {}

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

  @Post('issues')
  createIssue(@Req() request: RequestWithSession, @Body() body: unknown) {
    const input = parseOrValidation(() => createDdIssueRequestSchema.parse(body ?? {}));
    return this.dd.createIssue(permissionContext(request), input);
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
}
