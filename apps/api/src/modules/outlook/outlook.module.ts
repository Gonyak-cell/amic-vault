import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { OutlookController } from './outlook.controller';
import { OutlookService } from './outlook.service';

@Module({
  imports: [AuditModule, PermissionModule, TenantModule],
  controllers: [OutlookController],
  providers: [OutlookService],
  exports: [OutlookService],
})
export class OutlookModule {}
