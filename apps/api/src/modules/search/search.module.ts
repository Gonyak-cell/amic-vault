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
import {
  DenyAllSearchPermissionScopeProvider,
  SEARCH_PERMISSION_SCOPE_PROVIDER,
} from './permission/search-permission-scope.provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchFilterBuilder } from './query/search-filter.builder';
import { SearchQueryBuilder } from './query/search-query.builder';
import { SnippetBuilder } from './query/snippet-builder';

@Module({
  imports: [AuditModule, MetricsModule, TenantModule],
  controllers: [ReindexController, SearchController],
  providers: [
    DenyAllSearchPermissionScopeProvider,
    IndexFailureHandler,
    IndexingProcessor,
    PgRoleLookup,
    RequireRolesGuard,
    ReindexService,
    SearchFilterBuilder,
    SearchQueryBuilder,
    SearchIndexingService,
    SearchIndexRepository,
    SearchIndexSyncHook,
    SearchService,
    SnippetBuilder,
    {
      provide: SEARCH_PERMISSION_SCOPE_PROVIDER,
      useExisting: DenyAllSearchPermissionScopeProvider,
    },
  ],
  exports: [
    SEARCH_PERMISSION_SCOPE_PROVIDER,
    SearchFilterBuilder,
    SearchIndexingService,
    SearchIndexRepository,
    SearchIndexSyncHook,
    SearchQueryBuilder,
    SearchService,
    SnippetBuilder,
  ],
})
export class SearchModule {}
