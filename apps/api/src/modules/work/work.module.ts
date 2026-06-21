import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { WorkQueueController } from './work.controller';
import { WorkService } from './work.service';

@Module({
  imports: [AuditModule, PermissionModule, TenantModule],
  controllers: [WorkQueueController],
  providers: [WorkService],
  exports: [WorkService],
})
export class WorkModule {}
