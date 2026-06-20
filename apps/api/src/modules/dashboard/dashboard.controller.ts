import { BadRequestException, Controller, Get, Inject, Req } from '@nestjs/common';
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

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get('overview')
  getOverview(@Req() request: RequestWithSession) {
    return this.dashboard.getOverview(sessionUserId(request));
  }
}
