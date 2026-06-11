import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { BulkUploadJob } from './bulk-upload.job';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentUploadService } from './document-upload.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';

@Module({
  imports: [AuditModule, PermissionModule, StorageModule, TenantModule],
  controllers: [DocumentController],
  providers: [BulkUploadJob, DocumentService, DocumentUploadService, DuplicateDetectorService],
  exports: [BulkUploadJob, DocumentService, DocumentUploadService],
})
export class DocumentModule {}
