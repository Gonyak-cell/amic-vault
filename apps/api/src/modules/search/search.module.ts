import { Module } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { MetricsModule } from '../../common/metrics/metrics.module';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../tenant/tenant.module';
import { IndexFailureHandler } from './index/index-failure.handler';
import { IndexingProcessor } from './index/indexing.processor';
import { SearchIndexingService } from './index/indexing.service';
import { ReindexController } from './index/reindex.controller';
import { ReindexService } from './index/reindex.service';
import { SearchIndexRepository } from './index/search-index.repository';
import { SearchIndexSyncHook } from './index/index-sync.hook';
import { SearchFilterBuilder } from './query/search-filter.builder';

@Module({
  imports: [AuditModule, MetricsModule, TenantModule],
  controllers: [ReindexController],
  providers: [
    IndexFailureHandler,
    IndexingProcessor,
    PgRoleLookup,
    RequireRolesGuard,
    ReindexService,
    SearchFilterBuilder,
    SearchIndexingService,
    SearchIndexRepository,
    SearchIndexSyncHook,
  ],
  exports: [SearchFilterBuilder, SearchIndexingService, SearchIndexRepository, SearchIndexSyncHook],
})
export class SearchModule {}
