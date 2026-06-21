import { BadRequestException, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import type { RequestWithSession } from '../auth/session.guard';
import { NotificationsService } from './notifications.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function sessionUserId(request: RequestWithSession): string {
  const userId = request.session?.userId;
  if (!userId) throw validationFailed();
  return userId;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get()
  listNotifications(@Req() request: RequestWithSession) {
    return this.notifications.listNotifications(sessionUserId(request));
  }

  @Patch(':itemKey/read')
  markRead(@Req() request: RequestWithSession, @Param('itemKey') itemKey: string) {
    return this.notifications.markRead(sessionUserId(request), itemKey);
  }

  @Patch(':itemKey/dismiss')
  dismiss(@Req() request: RequestWithSession, @Param('itemKey') itemKey: string) {
    return this.notifications.dismiss(sessionUserId(request), itemKey);
  }
}
