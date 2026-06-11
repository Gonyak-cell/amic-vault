import { BadRequestException, Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { documentAuditQuerySchema } from '@amic-vault/shared';
import type { RequestWithSession } from '../auth/session.guard';
import { AuditQueryService } from './audit-query.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseUuid(value: string): string {
  if (!uuidPattern.test(value)) throw validationFailed();
  return value;
}

function parseQuery(query: unknown) {
  try {
    return documentAuditQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('documents/:documentId/audit-events')
export class AuditQueryController {
  constructor(@Inject(AuditQueryService) private readonly auditQuery: AuditQueryService) {}

  @Get()
  listDocumentAuditEvents(
    @Req() request: RequestWithSession,
    @Param('documentId') documentId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.auditQuery.listDocumentEvents(
      sessionUserId(request),
      parseUuid(documentId),
      parseQuery(query),
    );
  }
}
