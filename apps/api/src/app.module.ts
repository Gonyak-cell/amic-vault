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
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';

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
  imports: [LoggerModule, MetricsModule, AuditModule, TenantModule, AuthModule, HealthModule],
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
