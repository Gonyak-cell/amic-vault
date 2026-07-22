import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { SendOptions } from 'pg-boss';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../../common/process-role';
import { pgBossDbFromPoolClient } from '../../document/extraction/pool-client-db-adapter';
import { IndexingProcessor } from './indexing.processor';

export const searchIndexQueueName = 'search.index';
export const searchIndexDeadLetterQueueName = 'search.index.dead';

export interface SearchIndexJobPayload {
  tenantId: string;
  documentId: string;
  versionId: string;
}

export function isSearchIndexQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('SEARCH_INDEX_QUEUE_WORKER_ENABLED', env);
}

export function searchIndexQueueSendOptions(
  payload: SearchIndexJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: payload.versionId,
    retryLimit: 5,
    retryDelay: 1,
    retryBackoff: true,
    deadLetter: searchIndexDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

@Injectable()
export class SearchIndexingService implements OnModuleInit {
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(IndexingProcessor) private readonly processor: IndexingProcessor,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isSearchIndexQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async enqueueVersion(payload: SearchIndexJobPayload, client: PoolClient): Promise<string> {
    const boss = await this.ensureStarted();
    const jobId = await boss.send(
      searchIndexQueueName,
      payload,
      searchIndexQueueSendOptions(payload, client),
    );
    if (!jobId) throw new Error('search index job enqueue returned no id');
    return jobId;
  }

  async enqueueCurrentDocumentVersion(
    input: { tenantId: string; documentId: string },
    client: PoolClient,
  ): Promise<string | null> {
    const result = await client.query(
      `
        SELECT version_id
        FROM document_versions
        WHERE tenant_id = $1
          AND document_id = $2
          AND version_status = 'current'
        LIMIT 1
      `,
      [input.tenantId, input.documentId],
    );
    const versionId = (result.rows[0] as { version_id?: string } | undefined)?.version_id;
    if (!versionId) return null;
    return this.enqueueVersion({ ...input, versionId }, client);
  }

  async enqueueTenantOrMatterVersions(
    input: { tenantId: string; matterId?: string | null },
    client: PoolClient,
  ): Promise<string[]> {
    const params: unknown[] = [input.tenantId];
    const filters = ['dv.tenant_id = $1', "dv.version_status = 'current'"];
    if (input.matterId) {
      params.push(input.matterId);
      filters.push(`d.matter_id = $${params.length}`);
    }
    const result = await client.query(
      `
        SELECT dv.document_id, dv.version_id
        FROM document_versions dv
        JOIN documents d
          ON d.tenant_id = dv.tenant_id
          AND d.document_id = dv.document_id
        WHERE ${filters.join(' AND ')}
        ORDER BY dv.created_at ASC, dv.version_id ASC
      `,
      params,
    );
    const jobIds: string[] = [];
    for (const row of result.rows as Array<{ document_id: string; version_id: string }>) {
      jobIds.push(
        await this.enqueueVersion(
          { tenantId: input.tenantId, documentId: row.document_id, versionId: row.version_id },
          client,
        ),
      );
    }
    return jobIds;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await boss.work<SearchIndexJobPayload>(
      searchIndexQueueName,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await this.processor.handle(job.data);
      },
    );
    await boss.work<SearchIndexJobPayload>(
      searchIndexDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        await this.processor.markDeadLetter(job.data);
      },
    );
    this.workerRegistered = true;
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: searchIndexDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: searchIndexQueueName,
      options: {
        retryLimit: 5,
        retryDelay: 1,
        retryBackoff: true,
        deadLetter: searchIndexDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.producer(searchIndexQueueName);
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(searchIndexQueueName);
  }
}
