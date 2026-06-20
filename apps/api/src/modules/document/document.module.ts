import { Module } from '@nestjs/common';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AuditModule } from '../audit/audit.module';
import { MatterAppModule } from '../integrations/matter-app/matter-app.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { BulkUploadJob } from './bulk-upload.job';
import { DocumentController, DocumentMetadataController } from './document.controller';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentVersionService } from './document-version.service';
import { DocumentService } from './document.service';
import { DocumentUploadService } from './document-upload.service';
import { ExtractionDispatcher } from './extraction/extraction-dispatcher';
import { ExtractionQueueService } from './extraction/extraction-queue.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';
import { IntegrityCheckService } from './integrity/integrity-check.service';
import { UploadPreflightController } from './upload-preflight.controller';
import { VersionNumberResolver } from './version-number.resolver';

@Module({
  imports: [
    AuditModule,
    MatterAppModule,
    MetricsModule,
    PermissionModule,
    SearchModule,
    StorageModule,
    TenantModule,
    UserModule,
  ],
  controllers: [DocumentController, DocumentMetadataController, UploadPreflightController],
  providers: [
    BulkUploadJob,
    DocumentLifecycleService,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    ExtractionDispatcher,
    ExtractionQueueService,
    DuplicateDetectorService,
    IntegrityCheckService,
    VersionNumberResolver,
  ],
  exports: [
    BulkUploadJob,
    DocumentLifecycleService,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    ExtractionDispatcher,
    ExtractionQueueService,
    IntegrityCheckService,
  ],
})
export class DocumentModule {}
