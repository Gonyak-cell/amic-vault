import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService } from './audit.service';
import { PermissionEventRecorder } from './permission-event.recorder';

@Module({
  imports: [TenantModule],
  providers: [AuditMetadataNormalizer, AuditService, PermissionEventRecorder],
  exports: [AuditMetadataNormalizer, AuditService, PermissionEventRecorder],
})
export class AuditModule {}
