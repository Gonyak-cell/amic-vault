import { Module } from '@nestjs/common';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { BulkUploadJob } from './bulk-upload.job';
import { DocumentController, DocumentMetadataController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentUploadService } from './document-upload.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';
import { IntegrityCheckService } from './integrity/integrity-check.service';

@Module({
  imports: [AuditModule, MetricsModule, PermissionModule, StorageModule, TenantModule],
  controllers: [DocumentController, DocumentMetadataController],
  providers: [
    BulkUploadJob,
    DocumentService,
    DocumentUploadService,
    DuplicateDetectorService,
    IntegrityCheckService,
  ],
  exports: [BulkUploadJob, DocumentService, DocumentUploadService, IntegrityCheckService],
})
export class DocumentModule {}
