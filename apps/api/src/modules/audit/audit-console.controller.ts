import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { auditExportQuerySchema, auditQuerySchema } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { AuditQueryService } from './audit-query.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function parseOrValidation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') throw validationFailed();
    throw error;
  }
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('audit-events')
@RequireRoles('firm_admin', 'security_admin')
@UseGuards(RequireRolesGuard)
export class AuditConsoleController {
  constructor(@Inject(AuditQueryService) private readonly auditQuery: AuditQueryService) {}

  @Get()
  listTenantAuditEvents(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => auditQuerySchema.parse(query));
    return this.auditQuery.listTenantEvents(sessionUserId(request), input);
  }

  @Get('export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="amic-vault-audit-events.csv"')
  async exportTenantAuditEvents(
    @Req() request: RequestWithSession,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrValidation(() => auditExportQuerySchema.parse(query));
    const result = await this.auditQuery.exportTenantEvents(sessionUserId(request), input);
    return result.csv;
  }
}
