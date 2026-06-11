import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService } from './audit.service';

@Module({
  imports: [TenantModule],
  providers: [AuditMetadataNormalizer, AuditService],
  exports: [AuditMetadataNormalizer, AuditService],
})
export class AuditModule {}
