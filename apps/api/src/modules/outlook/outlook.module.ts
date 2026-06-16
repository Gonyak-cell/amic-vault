import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { TenantModule } from '../tenant/tenant.module';
import { OutlookAuthService } from './outlook-auth.service';
import { OutlookController } from './outlook.controller';
import {
  DisabledOutlookGraphAttachmentTransport,
  OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT,
} from './outlook-graph-attachment-transport';
import { OutlookGraphAttachmentService } from './outlook-graph-attachment.service';
import {
  DefaultOutlookIdentityVerifier,
  OUTLOOK_IDENTITY_VERIFIER,
} from './outlook-identity-verifier';
import { OutlookDocumentInsertionService } from './outlook-document-insertion.service';
import { OutlookSendFileService } from './outlook-send-file.service';
import { OutlookService } from './outlook.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule, TenantModule],
  controllers: [OutlookController],
  providers: [
    OutlookService,
    OutlookAuthService,
    OutlookGraphAttachmentService,
    OutlookSendFileService,
    OutlookDocumentInsertionService,
    DefaultOutlookIdentityVerifier,
    DisabledOutlookGraphAttachmentTransport,
    {
      provide: OUTLOOK_IDENTITY_VERIFIER,
      useExisting: DefaultOutlookIdentityVerifier,
    },
    {
      provide: OUTLOOK_GRAPH_ATTACHMENT_TRANSPORT,
      useExisting: DisabledOutlookGraphAttachmentTransport,
    },
  ],
  exports: [
    OutlookService,
    OutlookAuthService,
    OutlookGraphAttachmentService,
    OutlookSendFileService,
    OutlookDocumentInsertionService,
  ],
})
export class OutlookModule {}
