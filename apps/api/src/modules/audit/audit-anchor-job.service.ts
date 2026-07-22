import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { DatabaseService } from '../../common/db/database.service';
import { queueWorkerEnabled } from '../../common/process-role';
import { AuditAnchorService, normalizeAnchorDate } from './audit-anchor.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

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
export class AuditAnchorJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditAnchorJobService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(AuditAnchorService)
    private readonly anchorService: Pick<AuditAnchorService, 'recordDailyAnchor'>,
    @Inject(AuditAnchorTenantReader)
    private readonly tenantReader: Pick<AuditAnchorTenantReader, 'listActiveTenantIds'>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isAuditAnchorQueueWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
    const boss = await this.ensureStarted();
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

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedAuditAnchorBoss(this.logger, 'amic-vault-audit-anchor-worker');
    this.boss = await this.startPromise;
    return this.boss;
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

export async function createStartedAuditAnchorBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'AUDIT_ANCHOR_QUEUE_MIGRATE_ENABLED',
      createSchemaEnvName: 'AUDIT_ANCHOR_QUEUE_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'AUDIT_ANCHOR_QUEUE_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', () => {
    logger.warn({ code: 'AUDIT_ANCHOR_QUEUE_ERROR' });
  });
  await boss.start();
  return boss;
}

export async function ensureAuditAnchorSchedule(
  boss: Pick<PgBoss, 'createQueue' | 'schedule'>,
): Promise<void> {
  await boss.createQueue(auditAnchorDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(auditAnchorQueueName, {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: auditAnchorDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.schedule(
    auditAnchorQueueName,
    auditAnchorDailyCron(),
    { scope: 'previous-utc-day' },
    auditAnchorScheduleOptions(),
  );
}
