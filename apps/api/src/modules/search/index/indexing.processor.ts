import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { IndexFailureHandler } from './index-failure.handler';
import type { SearchIndexJobPayload } from './indexing.service';
import { SearchIndexRepository } from './search-index.repository';

@Injectable()
export class IndexingProcessor {
  private readonly logger = new Logger(IndexingProcessor.name);

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(IndexFailureHandler) private readonly failureHandler: IndexFailureHandler,
    @Inject(SearchIndexRepository) private readonly repository: SearchIndexRepository,
  ) {}

  async handle(payload: SearchIndexJobPayload): Promise<void> {
    await this.auditService.transaction(payload.tenantId, async (tx) => {
      const indexed = await this.repository.upsertVersion(tx, payload);
      if (!indexed) {
        this.logger.warn({ code: 'SEARCH_INDEX_TARGET_MISSING', versionId: payload.versionId });
        throw new Error('search index target missing');
      }
    });
  }

  async markDeadLetter(payload: SearchIndexJobPayload): Promise<void> {
    this.failureHandler.recordDeadLetter(payload, 'RETRY_EXHAUSTED');
  }
}
