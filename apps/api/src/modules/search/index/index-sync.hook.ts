import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { PoolClient } from 'pg';
import { SearchIndexingService } from './indexing.service';

@Injectable()
export class SearchIndexSyncHook {
  constructor(@Inject(ModuleRef) private readonly moduleRef: ModuleRef) {}

  async enqueueVersion(
    input: { tenantId: string; documentId: string; versionId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.indexingService().enqueueVersion(input, client);
  }

  async enqueueCurrentVersionForDocument(
    input: { tenantId: string; documentId: string },
    client: PoolClient,
  ): Promise<void> {
    await this.indexingService().enqueueCurrentDocumentVersion(input, client);
  }

  private indexingService(): SearchIndexingService {
    return this.moduleRef.get(SearchIndexingService, { strict: false });
  }
}
