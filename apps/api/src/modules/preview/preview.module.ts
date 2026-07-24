import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { PreviewController } from './preview.controller';
import { PreviewConvertJob } from './preview-convert.job';
import { PreviewPrecreateQueueService } from './preview-precreate-queue.service';
import { PreviewSessionService } from './preview-session.service';
import { PreviewService } from './preview.service';

@Module({
  imports: [AuditModule, PermissionModule, StorageModule, TenantModule],
  controllers: [PreviewController],
  providers: [PreviewConvertJob, PreviewPrecreateQueueService, PreviewSessionService, PreviewService],
  exports: [PreviewConvertJob, PreviewPrecreateQueueService, PreviewSessionService, PreviewService],
})
export class PreviewModule {}
