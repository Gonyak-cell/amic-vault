import { forwardRef, Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuditConsoleController } from './audit-console.controller';
import { AuditQueryController, MatterAuditQueryController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService } from './audit.service';
import { PermissionEventRecorder } from './permission-event.recorder';

@Module({
  imports: [TenantModule, forwardRef(() => PermissionModule)],
  controllers: [AuditConsoleController, AuditQueryController, MatterAuditQueryController],
  providers: [
    AuditMetadataNormalizer,
    AuditQueryService,
    AuditService,
    PermissionEventRecorder,
    PgRoleLookup,
    RequireRolesGuard,
  ],
  exports: [AuditMetadataNormalizer, AuditQueryService, AuditService, PermissionEventRecorder],
})
export class AuditModule {}
