import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { PreviewController } from './preview.controller';
import { PreviewConvertJob } from './preview-convert.job';
import { PreviewService } from './preview.service';

@Module({
  imports: [AuditModule, PermissionModule, StorageModule, TenantModule],
  controllers: [PreviewController],
  providers: [PreviewConvertJob, PreviewService],
  exports: [PreviewConvertJob, PreviewService],
})
export class PreviewModule {}
