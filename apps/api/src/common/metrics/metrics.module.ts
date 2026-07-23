import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware, MetricsRegistry } from './metrics.middleware';
import { OperationalMetricsService } from './operational-metrics.service';
import { PgBossQueueMetricsService } from './queue-metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsMiddleware,
    MetricsRegistry,
    OperationalMetricsService,
    PgBossQueueMetricsService,
  ],
  exports: [MetricsRegistry],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
