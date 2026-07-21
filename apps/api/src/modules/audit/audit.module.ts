import { forwardRef, Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { DatabaseModule } from '../../common/db/database.module';
import { PermissionModule } from '../permission/permission.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import {
  AuditAnchorJobService,
  AuditAnchorTenantReader,
} from './audit-anchor-job.service';
import { AuditAnchorService } from './audit-anchor.service';
import { AuditConsoleController } from './audit-console.controller';
import { AuditQueryController, MatterAuditQueryController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';
import { AuditMetadataNormalizer } from './audit-metadata.normalizer';
import { AuditService } from './audit.service';
import { PermissionEventRecorder } from './permission-event.recorder';

@Module({
  imports: [DatabaseModule, TenantModule, forwardRef(() => PermissionModule), StorageModule],
  controllers: [AuditConsoleController, AuditQueryController, MatterAuditQueryController],
  providers: [
    AuditAnchorJobService,
    AuditAnchorTenantReader,
    AuditAnchorService,
    AuditMetadataNormalizer,
    AuditQueryService,
    AuditService,
    PermissionEventRecorder,
    PgRoleLookup,
    RequireRolesGuard,
  ],
  exports: [
    AuditAnchorJobService,
    AuditAnchorService,
    AuditMetadataNormalizer,
    AuditQueryService,
    AuditService,
    PermissionEventRecorder,
  ],
})
export class AuditModule {}
