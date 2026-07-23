import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Public } from '../../modules/auth/public.decorator';
import { MetricsRegistry } from './metrics.middleware';
import { OperationalMetricsService } from './operational-metrics.service';
import { PgBossQueueMetricsService } from './queue-metrics.service';

@Controller()
export class MetricsController {
  constructor(
    @Inject(MetricsRegistry) private readonly registry: MetricsRegistry,
    @Inject(PgBossQueueMetricsService)
    private readonly queueMetrics: PgBossQueueMetricsService,
    @Inject(OperationalMetricsService)
    private readonly operationalMetrics: OperationalMetricsService,
  ) {}

  @Public()
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const [queueMetrics, operationalMetrics] = await Promise.all([
      this.queueMetrics.collect(),
      this.operationalMetrics.collect(),
    ]);
    return this.registry.render(queueMetrics, operationalMetrics);
  }
}
