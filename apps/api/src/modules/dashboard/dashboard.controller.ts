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
import { dashboardUsageStatsQuerySchema } from '@amic-vault/shared';
import { RequireRoles } from '../../common/decorators/require-roles.decorator';
import { RequireRolesGuard } from '../../common/guards/require-roles.guard';
import type { RequestWithSession } from '../auth/session.guard';
import { DashboardService } from './dashboard.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

function parseUsageStatsQuery(query: Record<string, unknown>) {
  try {
    return dashboardUsageStatsQuerySchema.parse(query ?? {});
  } catch {
    throw validationFailed();
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get('overview')
  getOverview(@Req() request: RequestWithSession) {
    return this.dashboard.getOverview(sessionUserId(request));
  }

  @Get('usage-stats')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  getUsageStats(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    return this.dashboard.getUsageStats(sessionUserId(request), parseUsageStatsQuery(query));
  }

  @Get('usage-stats/export.csv')
  @RequireRoles('firm_admin', 'security_admin')
  @UseGuards(RequireRolesGuard)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="amic-vault-usage-stats.csv"')
  exportUsageStatsCsv(@Req() request: RequestWithSession, @Query() query: Record<string, unknown>) {
    return this.dashboard.exportUsageStatsCsv(sessionUserId(request), parseUsageStatsQuery(query));
  }
}
