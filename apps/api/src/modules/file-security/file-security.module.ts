import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MatterAppModule } from '../integrations/matter-app/matter-app.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { FileScanQueueService } from './file-scan-queue.service';
import { FileSecurityService } from './file-security.service';
import { QuarantineIntakeService } from './quarantine-intake.service';

@Module({
  imports: [AuditModule, MatterAppModule, PermissionModule, StorageModule, TenantModule],
  providers: [FileSecurityService, FileScanQueueService, QuarantineIntakeService],
  exports: [FileSecurityService, FileScanQueueService, QuarantineIntakeService],
})
export class FileSecurityModule {}
