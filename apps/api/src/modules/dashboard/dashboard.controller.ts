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

@Controller('work')
export class WorkQueueController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get('items')
  listWorkItems(@Req() request: RequestWithSession) {
    return this.dashboard.getWorkQueue(sessionUserId(request));
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  listNotifications(@Req() request: RequestWithSession) {
    return this.dashboard.getNotificationCenter(sessionUserId(request));
  }
}
