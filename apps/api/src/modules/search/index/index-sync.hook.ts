import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SearchIndexingService } from './indexing.service';

@Injectable()
export class SearchIndexSyncHook {
  constructor(
    @Optional()
    @Inject(SearchIndexingService)
    private readonly indexingService?: SearchIndexingService,
  ) {}

  async enqueueVersion(
    input: { tenantId: string; documentId: string; versionId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.indexingService?.enqueueVersion(input, client);
  }

  async enqueueCurrentVersionForDocument(
    input: { tenantId: string; documentId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.indexingService?.enqueueCurrentDocumentVersion(input, client);
  }
}
