import { forwardRef, Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuditQueryController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService } from './audit.service';
import { PermissionEventRecorder } from './permission-event.recorder';

@Module({
  imports: [TenantModule, forwardRef(() => PermissionModule)],
  controllers: [AuditQueryController],
  providers: [AuditMetadataNormalizer, AuditQueryService, AuditService, PermissionEventRecorder],
  exports: [AuditMetadataNormalizer, AuditQueryService, AuditService, PermissionEventRecorder],
})
export class AuditModule {}
