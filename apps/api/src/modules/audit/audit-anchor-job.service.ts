import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { AuditAnchorService, normalizeAnchorDate } from './audit-anchor.service';

export const auditAnchorQueueName = 'audit.anchor.daily';
export const auditAnchorDeadLetterQueueName = 'audit.anchor.daily.dead';
export const auditAnchorScheduleKey = 'daily-utc';

export interface AuditAnchorJobPayload {
  scope?: 'previous-utc-day';
  anchorDate?: string;
}

export interface AuditAnchorJobResult {
  anchorDate: string;
  tenantCount: number;
  recordedCount: number;
  failedCount: number;
}

@Injectable()
export class AuditAnchorTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.databaseService.listActiveTenantRegistryIds();
  }
}

@Injectable()
export class AuditAnchorJobService implements OnModuleInit {
  private readonly logger = new Logger(AuditAnchorJobService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditAnchorService)
    private readonly anchorService: Pick<AuditAnchorService, 'recordDailyAnchor'>,
    @Inject(AuditAnchorTenantReader)
    private readonly tenantReader: Pick<AuditAnchorTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isAuditAnchorQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async recordDailyAnchors(input: { anchorDate: string }): Promise<AuditAnchorJobResult> {
    const anchorDate = normalizeAnchorDate(input.anchorDate);
    const tenantIds = await this.tenantReader.listActiveTenantIds();
    let recordedCount = 0;
    const failedTenantIds: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        await this.anchorService.recordDailyAnchor({ tenantId, anchorDate });
        recordedCount += 1;
      } catch {
        failedTenantIds.push(tenantId);
      }
    }

    if (failedTenantIds.length > 0) {
      this.logger.warn({
        code: 'AUDIT_ANCHOR_DAILY_JOB_PARTIAL_FAILURE',
        anchorDate,
        tenantCount: tenantIds.length,
        failedCount: failedTenantIds.length,
      });
      throw new Error(`audit anchor daily job failed for ${failedTenantIds.length} tenant(s)`);
    }

    return {
      anchorDate,
      tenantCount: tenantIds.length,
      recordedCount,
      failedCount: 0,
    };
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await ensureAuditAnchorSchedule(boss);
    await boss.work<AuditAnchorJobPayload>(
      auditAnchorQueueName,
      auditAnchorQueueWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleDailyJob(job)));
      },
    );
    await boss.work<AuditAnchorJobPayload>(
      auditAnchorDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'AUDIT_ANCHOR_DAILY_JOB_DEAD_LETTER',
          anchorDate: resolveAnchorDate(job.data),
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleDailyJob(job: Job<AuditAnchorJobPayload>): Promise<void> {
    await this.recordDailyAnchors({ anchorDate: resolveAnchorDate(job.data) });
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: auditAnchorDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: auditAnchorQueueName,
      options: {
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
        deadLetter: auditAnchorDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(auditAnchorQueueName);
  }
}

export function isAuditAnchorQueueWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('AUDIT_ANCHOR_QUEUE_WORKER_ENABLED', env);
}

export function auditAnchorDailyCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUDIT_ANCHOR_DAILY_CRON?.trim() || '10 0 * * *';
}

export function auditAnchorScheduleOptions(): ScheduleOptions {
  return {
    key: auditAnchorScheduleKey,
    tz: 'UTC',
    singletonKey: auditAnchorScheduleKey,
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
    deadLetter: auditAnchorDeadLetterQueueName,
  };
}

export function auditAnchorQueueWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export function previousUtcAnchorDate(now = new Date()): string {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return previous.toISOString().slice(0, 10);
}

export function resolveAnchorDate(payload: AuditAnchorJobPayload | null | undefined): string {
  if (payload?.anchorDate) return normalizeAnchorDate(payload.anchorDate);
  return previousUtcAnchorDate();
}

export async function ensureAuditAnchorSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    auditAnchorQueueName,
    auditAnchorDailyCron(),
    { scope: 'previous-utc-day' },
    auditAnchorScheduleOptions(),
  );
}
