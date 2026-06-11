import { Inject, Injectable, Logger } from '@nestjs/common';
import { MetricsRegistry } from '../../../common/metrics/metrics.middleware';
import type { SearchIndexJobPayload } from './indexing.service';

@Injectable()
export class IndexFailureHandler {
  private readonly logger = new Logger(IndexFailureHandler.name);

  constructor(@Inject(MetricsRegistry) private readonly metrics: MetricsRegistry) {}

  recordFailure(payload: SearchIndexJobPayload, reasonCode: string): void {
    this.metrics.recordSearchIndexFailure();
    this.logger.warn({
      code: 'SEARCH_INDEX_FAILURE',
      reasonCode,
      tenantId: payload.tenantId,
      documentId: payload.documentId,
      versionId: payload.versionId,
    });
  }

  recordDeadLetter(payload: SearchIndexJobPayload, reasonCode: string): void {
    this.metrics.recordSearchIndexFailure();
    this.logger.warn({
      code: 'SEARCH_INDEX_DEAD_LETTER',
      reasonCode,
      tenantId: payload.tenantId,
      documentId: payload.documentId,
      versionId: payload.versionId,
    });
  }
}
