import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ERROR_CODES } from '@amic-vault/shared';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CorrelationMiddleware } from './common/logging/correlation.middleware';
import { LoggerModule } from './common/logging/logger.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { LogErrorTracker } from './common/errors/error-tracker';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiPolicyModule } from './modules/ai-policy/ai-policy.module';
import { BreakGlassModule } from './modules/break-glass/break-glass.module';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ClientModule } from './modules/client/client.module';
import { EthicalWallModule } from './modules/ethical-wall/ethical-wall.module';
import { MatterModule } from './modules/matter/matter.module';
import { PartyModule } from './modules/party/party.module';
import { PermissionModule } from './modules/permission/permission.module';
import { StorageModule } from './modules/storage/storage.module';
import { DocumentModule } from './modules/document/document.module';
import { DlpModule } from './modules/dlp/dlp.module';
import { EmailModule } from './modules/email/email.module';
import { PreviewModule } from './modules/preview/preview.module';
import { SearchModule } from './modules/search/search.module';

@Controller()
class AppController {
  @Get()
  getApiRoot() {
    return {
      service: 'amic-vault-api',
      apiPrefix: '/v1',
      errorCodes: ERROR_CODES,
    };
  }
}

@Module({
  imports: [
    LoggerModule,
    MetricsModule,
    AiPolicyModule,
    AuditModule,
    BreakGlassModule,
    TenantModule,
    AuthModule,
    HealthModule,
    ClientModule,
    EthicalWallModule,
    PermissionModule,
    MatterModule,
    PartyModule,
    StorageModule,
    SearchModule,
    DlpModule,
    EmailModule,
    DocumentModule,
    PreviewModule,
  ],
  controllers: [AppController],
  providers: [
    LogErrorTracker,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
