import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MatterAppModule } from '../integrations/matter-app/matter-app.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { FileScanQueueService } from './file-scan-queue.service';
import { FilePromotionService } from './file-promotion.service';
import { FileSecurityReconcilerService } from './file-security-reconciler.service';
import { FileSecurityService } from './file-security.service';
import { QuarantineIntakeService } from './quarantine-intake.service';

@Module({
  imports: [AuditModule, MatterAppModule, PermissionModule, StorageModule, TenantModule],
  providers: [FileSecurityService, FilePromotionService, FileScanQueueService, FileSecurityReconcilerService, QuarantineIntakeService],
  exports: [FileSecurityService, FilePromotionService, FileScanQueueService, FileSecurityReconcilerService, QuarantineIntakeService],
})
export class FileSecurityModule {}
