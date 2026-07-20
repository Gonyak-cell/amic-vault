import { Controller, ForbiddenException, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { PermissionContext } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { BulkDownloadMonitorService } from './bulk-download-monitor.service';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function permissionContext(request: RequestWithSession): PermissionContext {
  const tenantId = request.session?.tenantId;
  const userId = request.session?.userId;
  const sessionId = request.session?.sessionId;
  if (!tenantId || !userId || !sessionId) throw permissionDenied();
  return { tenantId, userId, sessionId };
}

@Controller('dlp')
export class DlpController {
  constructor(
    @Inject(BulkDownloadMonitorService)
    private readonly bulkDownloadMonitor: BulkDownloadMonitorService,
  ) {}

  @Get('behavior-alerts')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  listBehaviorAlerts(@Req() request: RequestWithSession) {
    return this.bulkDownloadMonitor.listBehaviorAlerts(permissionContext(request));
  }
}
