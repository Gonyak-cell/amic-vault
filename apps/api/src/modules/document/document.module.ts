import { forwardRef, Module } from '@nestjs/common';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { FileSecurityModule } from '../file-security/file-security.module';
import { GraphModule } from '../graph/graph.module';
import { DdModule } from '../dd/dd.module';
import { MatterAppModule } from '../integrations/matter-app/matter-app.module';
import { PermissionModule } from '../permission/permission.module';
import { PreviewModule } from '../preview/preview.module';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { BulkUploadBatchController } from './bulk-upload-batch.controller';
import { BulkUploadBatchService } from './bulk-upload-batch.service';
import { BulkUploadJob } from './bulk-upload.job';
import { BulkUploadQueueService } from './bulk-upload-queue.service';
import { DocumentComparisonController } from './comparison/document-comparison.controller';
import { DocumentComparisonService } from './comparison/document-comparison.service';
import { DocumentController, DocumentMetadataController } from './document.controller';
import { DocumentEditingController } from './document-editing.controller';
import { DocumentEditingService } from './document-editing.service';
import { DocumentFolderController } from './document-folder.controller';
import { DocumentFolderService } from './document-folder.service';
import {
  EditSessionSweeperService,
  EditSessionSweepTenantReader,
} from './edit-session-sweeper.service';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentVersionService } from './document-version.service';
import { DocumentService } from './document.service';
import { DocumentUploadService } from './document-upload.service';
import { ExtractionDispatcher } from './extraction/extraction-dispatcher';
import { ExtractionQueueService } from './extraction/extraction-queue.service';
import { OcrBackfillController } from './extraction/ocr-backfill.controller';
import { OcrBackfillService } from './extraction/ocr-backfill.service';
import { OcrQueueService } from './extraction/ocr-queue.service';
import { OcrQueueWorkerService } from './extraction/ocr-queue-worker.service';
import { DuplicateDetectorService } from './integrity/duplicate-detector.service';
import { IntegrityCheckService } from './integrity/integrity-check.service';
import { UploadPreflightController } from './upload-preflight.controller';
import { VersionNumberResolver } from './version-number.resolver';
import { ZipChildDocumentService } from './zip-child-document.service';

@Module({
  imports: [
    AuditModule,
    DlpModule,
    forwardRef(() => FileSecurityModule),
    forwardRef(() => DdModule),
    GraphModule,
    MatterAppModule,
    MetricsModule,
    PermissionModule,
    PreviewModule,
    SearchModule,
    StorageModule,
    TenantModule,
    UserModule,
  ],
  controllers: [
    DocumentController,
    BulkUploadBatchController,
    DocumentComparisonController,
    DocumentFolderController,
    DocumentEditingController,
    DocumentMetadataController,
    OcrBackfillController,
    UploadPreflightController,
  ],
  providers: [
    BulkUploadJob,
    BulkUploadBatchService,
    BulkUploadQueueService,
    DocumentComparisonService,
    DocumentEditingService,
    DocumentFolderService,
    EditSessionSweeperService,
    EditSessionSweepTenantReader,
    DocumentLifecycleService,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    ExtractionDispatcher,
    ExtractionQueueService,
    OcrBackfillService,
    OcrQueueService,
    OcrQueueWorkerService,
    DuplicateDetectorService,
    IntegrityCheckService,
    VersionNumberResolver,
    ZipChildDocumentService,
  ],
  exports: [
    BulkUploadJob,
    BulkUploadBatchService,
    BulkUploadQueueService,
    DocumentComparisonService,
    DocumentEditingService,
    DocumentFolderService,
    EditSessionSweeperService,
    DocumentLifecycleService,
    DocumentService,
    DocumentVersionService,
    DocumentUploadService,
    ExtractionDispatcher,
    ExtractionQueueService,
    OcrQueueService,
    IntegrityCheckService,
    ZipChildDocumentService,
  ],
})
export class DocumentModule {}
