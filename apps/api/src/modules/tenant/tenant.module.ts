import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PgRoleLookup, RequireRolesGuard } from '../../common/guards/require-roles.guard';
import { TenantController } from './tenant.controller';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context';
import { TenantService } from './tenant.service';
import { PgTenantStore, TENANT_STORE } from './tenant.store';
import { WorkspaceService } from './workspace.service';

@Module({
  controllers: [TenantController],
  providers: [
    PgTenantStore,
    TenantContextMiddleware,
    TenantContextService,
    TenantService,
    WorkspaceService,
    PgRoleLookup,
    RequireRolesGuard,
    {
      provide: TENANT_STORE,
      useExisting: PgTenantStore,
    },
  ],
  exports: [TenantContextMiddleware, TenantContextService, TenantService, WorkspaceService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
