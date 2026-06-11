import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { EthicalWallController } from './ethical-wall.controller';
import { EthicalWallService } from './ethical-wall.service';

@Module({
  imports: [AuditModule, TenantModule],
  controllers: [EthicalWallController],
  providers: [EthicalWallService, PgRoleLookup, RequireRolesGuard],
  exports: [EthicalWallService],
})
export class EthicalWallModule {}

