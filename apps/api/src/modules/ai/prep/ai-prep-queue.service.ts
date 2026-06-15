import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, PgBoss, SendOptions } from 'pg-boss';
import { aiPrepArtifactKindSchema, aiPrepArtifactKinds, type AuditMetadata } from '@amic-vault/shared';
import { AuditService } from '../../audit/audit.service';
import { pgBossDbFromPoolClient } from '../../document/extraction/pool-client-db-adapter';
import { AiPrepProcessor } from './ai-prep.processor';
import {
  aiPrepDeadLetterQueueName,
  aiPrepQueueName,
  type AiPrepJobPayload,
} from './ai-prep.types';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

function workerEnabled(): boolean {
  return ['1', 'true', 'yes'].includes(
    (process.env.AI_PREP_QUEUE_WORKER_ENABLED ?? '').trim().toLowerCase(),
  );
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? '');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function aiPrepTenantConcurrencyAllows(
  activeTenantCounts: ReadonlyMap<string, number>,
  tenantId: string,
  maxTenantConcurrency = parsePositiveInteger(process.env.AI_PREP_TENANT_MAX_CONCURRENCY, 1),
): boolean {
  return (activeTenantCounts.get(tenantId) ?? 0) < maxTenantConcurrency;
}

export function aiPrepQueueSendOptions(
  payload: AiPrepJobPayload,
  client: PoolClient,
): SendOptions {
  return {
    singletonKey: `${payload.versionId}:${payload.artifactKind}`,
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    deadLetter: aiPrepDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function defaultAiPrepArtifactKinds(): AiPrepJobPayload['artifactKind'][] {
  const raw = process.env.AI_PREP_ARTIFACT_KINDS;
  if (!raw) return ['document_profile', 'key_fields', 'keyword_tags', 'filing_suggestions'];
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => aiPrepArtifactKindSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => entry.data);
  return [...new Set(parsed)].filter((entry) =>
    (aiPrepArtifactKinds as readonly string[]).includes(entry),
  );
}

@Injectable()
export class AiPrepQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiPrepQueueService.name);
  private readonly activeTenantCounts = new Map<string, number>();
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional()
    @Inject(AiPrepProcessor)
    private readonly processor?: AiPrepProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!workerEnabled() || !this.processor) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async enqueueVersionArtifacts(
    input: { tenantId: string; documentId: string; versionId: string; matterId?: string | null },
    client: PoolClient,
  ): Promise<string[]> {
    const targetMatterId = input.matterId ?? (await this.findMatterId(input, client));
    if (!targetMatterId) return [];
    const jobIds: string[] = [];
    for (const artifactKind of defaultAiPrepArtifactKinds()) {
      const payload: AiPrepJobPayload = {
        tenantId: input.tenantId,
        documentId: input.documentId,
        versionId: input.versionId,
        matterId: targetMatterId,
        artifactKind,
      };
      const boss = await this.ensureStarted();
      const jobId = await boss.send(aiPrepQueueName, payload, aiPrepQueueSendOptions(payload, client));
      if (!jobId) throw new Error('ai prep job enqueue returned no id');
      jobIds.push(jobId);
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorType: 'system',
          actorId: null,
          action: 'AI_PREP_REQUESTED',
          targetType: 'document_version',
          targetId: input.versionId,
          matterId: targetMatterId,
          metadata: prepAuditMetadata({
            document_id: input.documentId,
            version_id: input.versionId,
            matter_id: targetMatterId,
            ai_prep_kind: artifactKind,
            ai_prep_status: 'pending',
          }),
        },
        client,
      );
    }
    return jobIds;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered || !this.processor) return;
    const boss = await this.ensureStarted();
    await boss.work<AiPrepJobPayload>(
      aiPrepQueueName,
      {
        batchSize: parsePositiveInteger(process.env.AI_PREP_QUEUE_BATCH_SIZE, 1),
        pollingIntervalSeconds: 1,
      },
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleQueuedJob(job)));
      },
    );
    await boss.work<AiPrepJobPayload>(
      aiPrepDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job || !this.processor) return;
        await this.processor.markDeadLetter(job.data, String(job.id));
      },
    );
    this.workerRegistered = true;
  }

  private async handleQueuedJob(job: Job<AiPrepJobPayload>): Promise<void> {
    if (!this.processor) return;
    if (!aiPrepTenantConcurrencyAllows(this.activeTenantCounts, job.data.tenantId)) {
      throw new Error('ai prep tenant concurrency limit reached');
    }
    this.activeTenantCounts.set(
      job.data.tenantId,
      (this.activeTenantCounts.get(job.data.tenantId) ?? 0) + 1,
    );
    try {
      await this.processor.handle(job.data);
    } finally {
      const nextCount = (this.activeTenantCounts.get(job.data.tenantId) ?? 1) - 1;
      if (nextCount > 0) this.activeTenantCounts.set(job.data.tenantId, nextCount);
      else this.activeTenantCounts.delete(job.data.tenantId);
    }
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
      application_name: 'amic-vault-ai-prep-queue',
      supervise: true,
      migrate: true,
    });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'AI_PREP_QUEUE_ERROR', message: String(error.message) });
    });
    await boss.start();
    await boss.createQueue(aiPrepDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(aiPrepQueueName, {
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: aiPrepDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    return boss;
  }

  private async findMatterId(
    input: { tenantId: string; documentId: string },
    client: PoolClient,
  ): Promise<string | null> {
    const result = await client.query(
      `
        SELECT matter_id
        FROM documents
        WHERE tenant_id = $1
          AND document_id = $2
        LIMIT 1
      `,
      [input.tenantId, input.documentId],
    );
    return (result.rows[0] as { matter_id?: string } | undefined)?.matter_id ?? null;
  }
}

function prepAuditMetadata(metadata: AuditMetadata): AuditMetadata {
  return metadata;
}
