import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { WorkModule } from '../work/work.module';
import { RecordsController } from './records.controller';
import { RecordsDisposalWorker } from './records-disposal.worker';
import { RecordsService } from './records.service';
import { RetentionSchedulerService, RetentionTenantReader } from './retention-scheduler.service';

@Module({
  imports: [AuditModule, PermissionModule, StorageModule, TenantModule, UserModule, WorkModule],
  controllers: [RecordsController],
  providers: [RecordsService, RecordsDisposalWorker, RetentionSchedulerService, RetentionTenantReader],
  exports: [RecordsService, RetentionSchedulerService],
})
export class RecordsModule {}
