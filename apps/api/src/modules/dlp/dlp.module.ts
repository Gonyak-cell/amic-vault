import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import {
  BulkDownloadMonitorService,
  BulkDownloadMonitorTenantReader,
} from './bulk-download-monitor.service';
import { DlpController } from './dlp.controller';
import { DlpService } from './dlp.service';
import { SensitiveDataDetector } from './sensitive-data.detector';

@Module({
  imports: [AuditModule, PermissionModule],
  controllers: [DlpController],
  providers: [
    DlpService,
    SensitiveDataDetector,
    BulkDownloadMonitorService,
    BulkDownloadMonitorTenantReader,
    PgRoleLookup,
    RequireRolesGuard,
  ],
  exports: [DlpService, BulkDownloadMonitorService],
})
export class DlpModule {}
