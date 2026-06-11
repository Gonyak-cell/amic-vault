import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Public } from '../../modules/auth/public.decorator';
import { MetricsRegistry } from './metrics.middleware';

@Controller()
export class MetricsController {
  constructor(@Inject(MetricsRegistry) private readonly registry: MetricsRegistry) {}

  @Public()
  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return this.registry.render();
  }
}
