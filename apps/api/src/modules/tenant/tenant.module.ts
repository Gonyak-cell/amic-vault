import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
