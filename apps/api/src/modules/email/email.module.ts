import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DlpModule } from '../dlp/dlp.module';
import { DocumentModule } from '../document/document.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({
  imports: [
    AuditModule,
    DlpModule,
    DocumentModule,
    PermissionModule,
    StorageModule,
    TenantModule,
    UserModule,
  ],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
