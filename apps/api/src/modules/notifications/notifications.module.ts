import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LitigationModule } from '../litigation/litigation.module';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import {
  DdRfiNotificationSchedulerService,
  DdRfiNotificationTenantReader,
} from './dd-rfi-notification-scheduler.service';
import {
  LitigationDeadlineNotificationSchedulerService,
  LitigationDeadlineNotificationTenantReader,
} from './litigation-deadline-notification-scheduler.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuditModule, LitigationModule, PermissionModule, TenantModule],
  controllers: [NotificationsController],
  providers: [
    DdRfiNotificationSchedulerService,
    DdRfiNotificationTenantReader,
    LitigationDeadlineNotificationSchedulerService,
    LitigationDeadlineNotificationTenantReader,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
