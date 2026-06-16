import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { PgBoss, SendOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../../common/db/pg-boss-runtime-options';
import { pgBossDbFromPoolClient } from '../../document/extraction/pool-client-db-adapter';
import { IndexingProcessor } from './indexing.processor';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const searchIndexQueueName = 'search.index';
export const searchIndexDeadLetterQueueName = 'search.index.dead';

export interface SearchIndexJobPayload {
  tenantId: string;
  documentId: string;
  versionId: string;
}

function workerEnabled(): boolean {
  return ['1', 'true', 'yes'].includes(
    (process.env.SEARCH_INDEX_QUEUE_WORKER_ENABLED ?? '').trim().toLowerCase(),
  );
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
export class SearchIndexingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchIndexingService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(@Inject(IndexingProcessor) private readonly processor: IndexingProcessor) {}

  async onModuleInit(): Promise<void> {
    if (!workerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
    const boss = await this.ensureStarted();
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

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= this.createStartedBoss();
    this.boss = await this.startPromise;
    return this.boss;
  }

  private async createStartedBoss(): Promise<PgBoss> {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: databaseUrl,
      ...pgBossRuntimeOptions({
        applicationName: 'amic-vault-search-index-queue',
        migrateEnvName: 'SEARCH_INDEX_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'SEARCH_INDEX_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'SEARCH_INDEX_QUEUE_SUPERVISE_ENABLED',
      }),
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'SEARCH_INDEX_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(searchIndexDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(searchIndexQueueName, {
      retryLimit: 5,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: searchIndexDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }
}
