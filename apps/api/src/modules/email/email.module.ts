import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { EmailService } from './email.service';

@Module({
  imports: [AuditModule, StorageModule, TenantModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
