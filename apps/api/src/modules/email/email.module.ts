import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { DocumentModule } from '../document/document.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { EmailController } from './email.controller';
import { EmailReparseService } from './email-reparse.service';
import { EmailService } from './email.service';
import { EmailThreadService } from './email-thread.service';
import { EmailWorkerParserClient } from './email-worker-parser.client';

@Module({
  imports: [
    AuditModule,
    DlpModule,
    DocumentModule,
    PermissionModule,
    SearchModule,
    StorageModule,
    TenantModule,
    UserModule,
  ],
  controllers: [EmailController],
  providers: [EmailWorkerParserClient, EmailService, EmailReparseService, EmailThreadService],
  exports: [EmailService, EmailReparseService, EmailThreadService],
})
export class EmailModule {}
