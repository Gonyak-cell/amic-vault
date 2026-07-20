import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractIntelModule } from '../contract-intel/contract-intel.module';
import { DocumentModule } from '../document/document.module';
import { GraphModule } from '../graph/graph.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { TenantModule } from '../tenant/tenant.module';
import { WorkModule } from '../work/work.module';
import { DdController } from './dd.controller';
import { DdExportQueueService } from './dd-export-queue.service';
import { DdService } from './dd.service';

@Module({
  imports: [
    AuditModule,
    ContractIntelModule,
    forwardRef(() => DocumentModule),
    GraphModule,
    PermissionModule,
    SearchModule,
    TenantModule,
    WorkModule,
  ],
  controllers: [DdController],
  providers: [DdExportQueueService, DdService],
  exports: [DdService],
})
export class DdModule {}
