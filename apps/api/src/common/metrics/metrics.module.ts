import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware, MetricsRegistry } from './metrics.middleware';
import { PgBossQueueMetricsService } from './queue-metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsMiddleware, MetricsRegistry, PgBossQueueMetricsService],
  exports: [MetricsRegistry],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
