import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { RecordsService } from './records.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
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

function optionalUuid(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw validationFailed();
  return parseUuid(value);
}

@Controller('records')
export class RecordsController {
  constructor(@Inject(RecordsService) private readonly records: RecordsService) {}

  @Post('retention-policies')
  createRetentionPolicy(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.records.createRetentionPolicy(permissionContext(request), body);
  }

  @Get('retention-policies')
  listRetentionPolicies(@Req() request: RequestWithSession) {
    return this.records.listRetentionPolicies(permissionContext(request));
  }

  @Post('legal-holds')
  createLegalHold(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.records.createLegalHold(permissionContext(request), body);
  }

  @Get('legal-holds')
  listLegalHolds(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const matterId = optionalUuid(query.matterId);
    return this.records.listLegalHolds(
      permissionContext(request),
      matterId ? { matterId } : {},
    );
  }

  @Post('legal-holds/:legalHoldId/release')
  releaseLegalHold(@Req() request: RequestWithSession, @Param('legalHoldId') legalHoldId: string) {
    return this.records.releaseLegalHold(permissionContext(request), parseUuid(legalHoldId));
  }

  @Post('archives')
  archiveDocument(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.records.archiveDocument(permissionContext(request), body);
  }

  @Post('disposals')
  createDisposalRequest(@Req() request: RequestWithSession, @Body() body: unknown) {
    return this.records.createDisposalRequest(permissionContext(request), body);
  }

  @Post('disposals/:disposalRequestId/approve')
  approveDisposalRequest(
    @Req() request: RequestWithSession,
    @Param('disposalRequestId') disposalRequestId: string,
  ) {
    return this.records.approveDisposalRequest(
      permissionContext(request),
      parseUuid(disposalRequestId),
    );
  }

  @Post('disposals/:disposalRequestId/execute')
  executeDisposalRequest(
    @Req() request: RequestWithSession,
    @Param('disposalRequestId') disposalRequestId: string,
  ) {
    return this.records.executeDisposalRequest(
      permissionContext(request),
      parseUuid(disposalRequestId),
    );
  }

  @Get('disposals/:disposalRequestId/certificate')
  getDisposalCertificate(
    @Req() request: RequestWithSession,
    @Param('disposalRequestId') disposalRequestId: string,
  ) {
    return this.records.getDisposalCertificate(
      permissionContext(request),
      parseUuid(disposalRequestId),
    );
  }
}
