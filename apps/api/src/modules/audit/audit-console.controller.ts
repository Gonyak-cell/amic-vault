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
import { TenantContextService } from '../tenant/tenant-context';
import { AuditAnchorService, type AuditAnchorRecord } from './audit-anchor.service';
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
  constructor(
    @Inject(AuditQueryService) private readonly auditQuery: AuditQueryService,
    @Inject(AuditAnchorService) private readonly auditAnchors: AuditAnchorService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

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

  @Get('anchors')
  async listAuditAnchors() {
    const context = this.tenantContext.require();
    const anchors = await this.auditAnchors.listRecentAnchors({ tenantId: context.tenantId });
    const latest = anchors[0] ?? null;
    if (!latest) return { status: 'missing', latest: null, items: [] };
    const oldest = anchors[anchors.length - 1] ?? latest;
    const verification = await this.auditAnchors.verifyAnchors({
      tenantId: context.tenantId,
      fromDate: oldest.anchorDate,
      toDate: latest.anchorDate,
    });
    return {
      status: verification.ok ? 'verified' : 'mismatch',
      latest: publicAnchor(latest),
      items: anchors.map(publicAnchor),
      mismatchCount: verification.items.filter((item) => !item.verified).length,
    };
  }
}

function publicAnchor(anchor: AuditAnchorRecord) {
  return {
    anchorId: anchor.anchorId,
    anchorDate: anchor.anchorDate,
    seqStart: anchor.seqStart,
    seqEnd: anchor.seqEnd,
    eventCount: anchor.eventCount,
    anchorHash: anchor.anchorHash,
    storageRecorded: Boolean(anchor.storageUri),
    createdAt: anchor.createdAt,
  };
}
