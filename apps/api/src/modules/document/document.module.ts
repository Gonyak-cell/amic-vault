import { Module } from '@nestjs/common';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { BulkUploadJob } from './bulk-upload.job';
import { DocumentController, DocumentMetadataController } from './document.controller';
import { DocumentVersionService } from './document-version.service';
import { DocumentService } from './document.service';
import { DocumentUploadService } from './document-upload.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';
import { IntegrityCheckService } from './integrity/integrity-check.service';
import { VersionNumberResolver } from './version-number.resolver';

@Module({
  imports: [AuditModule, MetricsModule, PermissionModule, StorageModule, TenantModule, UserModule],
  controllers: [DocumentController, DocumentMetadataController],
  providers: [
    BulkUploadJob,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    DuplicateDetectorService,
    IntegrityCheckService,
    VersionNumberResolver,
  ],
  exports: [
    BulkUploadJob,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    IntegrityCheckService,
  ],
})
export class DocumentModule {}
