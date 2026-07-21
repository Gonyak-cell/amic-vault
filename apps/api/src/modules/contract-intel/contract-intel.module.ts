import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { ContractAiReviewQueueService } from './contract-ai-review-queue.service';
import { ContractIntelController } from './contract-intel.controller';
import { ContractIntelService } from './contract-intel.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule],
  controllers: [ContractIntelController],
  providers: [ContractAiReviewQueueService, ContractIntelService, PgRoleLookup, RequireRolesGuard],
  exports: [ContractAiReviewQueueService, ContractIntelService],
})
export class ContractIntelModule {}
