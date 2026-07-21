import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Job, SendOptions, WorkOptions } from 'pg-boss';
import {
  aiPrepArtifactKindSchema,
  aiPrepArtifactKinds,
  type AuditMetadata,
} from '@amic-vault/shared';
import { currentProcessRole, queueWorkerEnabled } from '../../../common/process-role';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { AuditService } from '../../audit/audit.service';
import { pgBossDbFromPoolClient } from '../../document/extraction/pool-client-db-adapter';
import { AiPrepProcessor } from './ai-prep.processor';
import { aiPrepDeadLetterQueueName, aiPrepQueueName, type AiPrepJobPayload } from './ai-prep.types';

const localGemmaPrepGroupId = 'local_gemma';

export function isAiPrepQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('AI_PREP_QUEUE_WORKER_ENABLED', env);
}

function truthy(raw: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((raw ?? '').trim().toLowerCase());
}

export function aiPrepEnabled(): boolean {
  return truthy(process.env.AI_PREP_ENABLED);
}

export function aiPrepCanaryTenantIds(raw = process.env.AI_PREP_CANARY_TENANT_IDS): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function tenantAllowlistRequired(): boolean {
  const explicit = process.env.AI_PREP_REQUIRE_TENANT_ALLOWLIST;
  if (explicit !== undefined) return truthy(explicit);
  return process.env.NODE_ENV === 'production';
}

export function aiPrepTenantAllowed(
  tenantId: string,
  options: { canaryTenantIds?: ReadonlySet<string>; requireAllowlist?: boolean } = {},
): boolean {
  const allowedTenantIds = options.canaryTenantIds ?? aiPrepCanaryTenantIds();
  const requireAllowlist = options.requireAllowlist ?? tenantAllowlistRequired();
  if (allowedTenantIds.size === 0) return !requireAllowlist;
  return allowedTenantIds.has(tenantId);
}

export function aiPrepGateFailureReason(
  tenantId: string,
): 'AI_PREP_DISABLED' | 'AI_PREP_SCOPE_DENIED' | null {
  if (!aiPrepEnabled()) return 'AI_PREP_DISABLED';
  if (!aiPrepTenantAllowed(tenantId)) return 'AI_PREP_SCOPE_DENIED';
  return null;
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? '');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function aiPrepQueueExpireSeconds(): number {
  const configured = Number(process.env.AI_PREP_QUEUE_EXPIRE_SECONDS ?? '');
  if (Number.isInteger(configured) && configured > 0) return configured;
  const timeoutMs = parsePositiveInteger(process.env.LOCAL_GEMMA_TIMEOUT_MS, 300_000);
  return Math.max(420, Math.ceil(timeoutMs / 1000) + 60);
}

export function aiPrepTenantConcurrencyAllows(
  activeTenantCounts: ReadonlyMap<string, number>,
  tenantId: string,
  maxTenantConcurrency = parsePositiveInteger(process.env.AI_PREP_TENANT_MAX_CONCURRENCY, 1),
): boolean {
  return (activeTenantCounts.get(tenantId) ?? 0) < maxTenantConcurrency;
}

export function aiPrepQueueSendOptions(payload: AiPrepJobPayload, client: PoolClient): SendOptions {
  return {
    singletonKey: `${payload.versionId}:${payload.artifactKind}`,
    group: { id: localGemmaPrepGroupId },
    expireInSeconds: aiPrepQueueExpireSeconds(),
    retryLimit: 5,
    retryDelay: 2,
    retryBackoff: true,
    deadLetter: aiPrepDeadLetterQueueName,
    db: pgBossDbFromPoolClient(client),
  };
}

export function aiPrepQueueWorkOptions(): WorkOptions {
  return {
    batchSize: parsePositiveInteger(process.env.AI_PREP_QUEUE_BATCH_SIZE, 1),
    localConcurrency: 1,
    groupConcurrency: 1,
    pollingIntervalSeconds: 1,
  };
}

export function defaultAiPrepArtifactKinds(): AiPrepJobPayload['artifactKind'][] {
  const raw = process.env.AI_PREP_ARTIFACT_KINDS;
  if (!raw) {
    return [
      'document_profile',
      'key_fields',
      'date_facts',
      'keyword_tags',
      'filing_suggestions',
      'fact_candidates',
      'issue_candidates',
      'risk_candidates',
      'graph_candidate_edges',
    ];
  }
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
export class AiPrepQueueService implements OnModuleInit {
  private readonly logger = new Logger(AiPrepQueueService.name);
  private readonly activeTenantCounts = new Map<string, number>();
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
    @Optional()
    @Inject(AiPrepProcessor)
    private readonly processor?: AiPrepProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    this.ensureQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isAiPrepQueueWorkerEnabled() || !this.processor) return;
    await this.registerWorkers();
  }

  async enqueueVersionArtifacts(
    input: { tenantId: string; documentId: string; versionId: string; matterId?: string | null },
    client: PoolClient,
  ): Promise<string[]> {
    const targetMatterId = input.matterId ?? (await this.findMatterId(input, client));
    if (!targetMatterId) return [];
    const gateFailureReason = aiPrepGateFailureReason(input.tenantId);
    if (gateFailureReason) {
      await this.auditService.log(
        {
          tenantId: input.tenantId,
          actorType: 'system',
          actorId: null,
          action: 'AI_PREP_BLOCKED',
          targetType: 'document_version',
          targetId: input.versionId,
          matterId: targetMatterId,
          result: 'denied',
          metadata: prepAuditMetadata({
            document_id: input.documentId,
            version_id: input.versionId,
            matter_id: targetMatterId,
            ai_prep_status: 'blocked',
            reason_code: gateFailureReason,
          }),
        },
        client,
      );
      return [];
    }
    const jobIds: string[] = [];
    for (const artifactKind of defaultAiPrepArtifactKinds()) {
      const payload: AiPrepJobPayload = {
        tenantId: input.tenantId,
        documentId: input.documentId,
        versionId: input.versionId,
        matterId: targetMatterId,
        artifactKind,
      };
      this.ensureQueueDefinitions();
      const boss = await this.queueRegistry.producer(aiPrepQueueName);
      const jobId = await boss.send(
        aiPrepQueueName,
        payload,
        aiPrepQueueSendOptions(payload, client),
      );
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
    const boss = await this.queueRegistry.consumer(aiPrepQueueName);
    await boss.work<AiPrepJobPayload>(
      aiPrepQueueName,
      aiPrepQueueWorkOptions(),
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
    const gateFailureReason = aiPrepGateFailureReason(job.data.tenantId);
    if (gateFailureReason) {
      await this.auditService.log({
        tenantId: job.data.tenantId,
        actorType: 'system',
        actorId: null,
        action: 'AI_PREP_BLOCKED',
        targetType: 'document_version',
        targetId: job.data.versionId,
        matterId: job.data.matterId ?? null,
        result: 'denied',
        metadata: prepAuditMetadata({
          document_id: job.data.documentId,
          version_id: job.data.versionId,
          matter_id: job.data.matterId ?? null,
          ai_prep_kind: job.data.artifactKind,
          ai_prep_status: 'blocked',
          reason_code: gateFailureReason,
        }),
      });
      return;
    }
    if (!aiPrepTenantConcurrencyAllows(this.activeTenantCounts, job.data.tenantId)) {
      throw new Error('ai prep tenant concurrency limit reached');
    }
    this.activeTenantCounts.set(
      job.data.tenantId,
      (this.activeTenantCounts.get(job.data.tenantId) ?? 0) + 1,
    );
    try {
      await this.processor.handle(job.data);
    } catch (error) {
      this.logger.warn({
        code: 'AI_PREP_WORKER_EXCEPTION',
        artifactKind: job.data.artifactKind,
        versionId: job.data.versionId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await this.processor.markWorkerFailure(job.data, 'AI_PREP_WORKER_EXCEPTION');
    } finally {
      const nextCount = (this.activeTenantCounts.get(job.data.tenantId) ?? 1) - 1;
      if (nextCount > 0) this.activeTenantCounts.set(job.data.tenantId, nextCount);
      else this.activeTenantCounts.delete(job.data.tenantId);
    }
  }

  private ensureQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    const registered = new Set(this.queueRegistry.registeredQueueNames());
    const existingDefinitions = [aiPrepDeadLetterQueueName, aiPrepQueueName].filter((name) =>
      registered.has(name),
    );
    if (existingDefinitions.length > 0) {
      if (existingDefinitions.length !== 2) throw new Error('AI_PREP_QUEUE_DEFINITION_PARTIAL');
      this.queueDefinitionsRegistered = true;
      return;
    }
    this.queueRegistry.register({
      name: aiPrepDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: aiPrepQueueName,
      options: {
        expireInSeconds: aiPrepQueueExpireSeconds(),
        retryLimit: 5,
        retryDelay: 2,
        retryBackoff: true,
        deadLetter: aiPrepDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
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
