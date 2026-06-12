import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { ContractIntelController } from './contract-intel.controller';
import { ContractIntelService } from './contract-intel.service';

@Module({
  imports: [AuditModule, PermissionModule],
  controllers: [ContractIntelController],
  providers: [ContractIntelService, PgRoleLookup, RequireRolesGuard],
  exports: [ContractIntelService],
})
export class ContractIntelModule {}
