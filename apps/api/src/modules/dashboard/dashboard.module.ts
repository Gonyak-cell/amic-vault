import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuditModule, PermissionModule, TenantModule],
  controllers: [DashboardController],
  providers: [DashboardService, PgRoleLookup, RequireRolesGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
