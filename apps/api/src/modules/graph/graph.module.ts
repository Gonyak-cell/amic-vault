import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { AuditModule } from '../audit/audit.module';
import { PermissionModule } from '../permission/permission.module';
import { SearchModule } from '../search/search.module';
import { GraphConsistencyService } from './graph-consistency.service';
import { GraphController } from './graph.controller';
import { GraphQueryService } from './graph-query.service';
import { GraphSyncOutboxWorker } from './graph-sync-outbox.worker';
import { GraphSyncService } from './graph-sync.service';

@Module({
  imports: [AuditModule, PermissionModule, SearchModule],
  controllers: [GraphController],
  providers: [
    GraphConsistencyService,
    GraphQueryService,
    GraphSyncOutboxWorker,
    GraphSyncService,
    PgRoleLookup,
    RequireRolesGuard,
  ],
  exports: [GraphConsistencyService, GraphQueryService, GraphSyncOutboxWorker, GraphSyncService],
})
export class GraphModule {}
