import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Public } from '../../modules/auth/public.decorator';
import { MetricsRegistry } from './metrics.middleware';
import { PgBossQueueMetricsService } from './queue-metrics.service';

@Controller()
export class MetricsController {
  constructor(
    @Inject(MetricsRegistry) private readonly registry: MetricsRegistry,
    @Inject(PgBossQueueMetricsService)
    private readonly queueMetrics: PgBossQueueMetricsService,
  ) {}

  @Public()
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    return this.registry.render(await this.queueMetrics.collect());
  }
}
