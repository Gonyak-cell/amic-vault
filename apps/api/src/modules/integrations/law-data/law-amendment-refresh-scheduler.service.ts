import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../../common/process-role';
import { LawDataService } from './law-data.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const lawAmendmentRefreshQueueName = 'law.amendment-refresh';
export const lawAmendmentRefreshDeadLetterQueueName = 'law.amendment-refresh.dead';
export const lawAmendmentRefreshScheduleKey = 'law-amendment-refresh';

export interface LawAmendmentRefreshJobPayload {
  scope?: 'law-amendment-refresh';
  tenantId?: string;
  limit?: number;
  staleBefore?: string;
}

export interface LawAmendmentRefreshJobResult {
  tenantCount: number;
  selectedCount: number;
  refreshedCount: number;
  skippedCount: number;
  notConfiguredTenantCount: number;
  failedCount: number;
}

@Injectable()
export class LawDataTenantReader implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: databaseUrl });

  async listActiveTenantIds(): Promise<string[]> {
    const result = await this.pool.query<{ tenant_id: string }>(
      `
        SELECT tenant_id::text AS tenant_id
        FROM tenants
        WHERE status = 'active'
        ORDER BY tenant_id ASC
      `,
    );
    return result.rows.map((row) => row.tenant_id);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Injectable()
export class LawAmendmentRefreshSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LawAmendmentRefreshSchedulerService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(LawDataService)
    private readonly lawData: Pick<LawDataService, 'refreshStaleLawAuthoritiesForTenant'>,
    @Inject(LawDataTenantReader)
    private readonly tenantReader: Pick<LawDataTenantReader, 'listActiveTenantIds'>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isLawAmendmentRefreshSchedulerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async refreshLawAmendments(
    payload: LawAmendmentRefreshJobPayload = {},
  ): Promise<LawAmendmentRefreshJobResult> {
    const tenantIds = payload.tenantId
      ? [payload.tenantId]
      : await this.tenantReader.listActiveTenantIds();
    const staleBefore = payload.staleBefore ? new Date(payload.staleBefore) : undefined;
    let selectedCount = 0;
    let refreshedCount = 0;
    let skippedCount = 0;
    let notConfiguredTenantCount = 0;
    const failureMessages: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        const result = await this.lawData.refreshStaleLawAuthoritiesForTenant(tenantId, {
          limit: payload.limit,
          ...(staleBefore && !Number.isNaN(staleBefore.getTime()) ? { staleBefore } : {}),
        });
        selectedCount += result.selectedCount;
        refreshedCount += result.refreshedCount;
        skippedCount += result.skippedCount;
        if (result.notConfigured) notConfiguredTenantCount += 1;
      } catch (error) {
        failureMessages.push(error instanceof Error ? error.message : 'unknown');
      }
    }

    if (failureMessages.length > 0) {
      this.logger.warn({
        code: 'LAW_AMENDMENT_REFRESH_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failureMessages.length,
      });
      throw new Error(`law amendment refresh failed: ${failureMessages.join('; ')}`);
    }

    return {
      tenantCount: tenantIds.length,
      selectedCount,
      refreshedCount,
      skippedCount,
      notConfiguredTenantCount,
      failedCount: 0,
    };
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await ensureLawAmendmentRefreshSchedule(boss);
    await boss.work<LawAmendmentRefreshJobPayload>(
      lawAmendmentRefreshQueueName,
      lawAmendmentRefreshWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleRefreshJob(job)));
      },
    );
    await boss.work<LawAmendmentRefreshJobPayload>(
      lawAmendmentRefreshDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'LAW_AMENDMENT_REFRESH_DEAD_LETTER',
          scope: job.data?.scope ?? 'law-amendment-refresh',
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleRefreshJob(job: Job<LawAmendmentRefreshJobPayload>): Promise<void> {
    await this.refreshLawAmendments(job.data ?? {});
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedLawAmendmentRefreshBoss(
      this.logger,
      'amic-vault-law-amendment-refresh-worker',
    );
    this.boss = await this.startPromise;
    return this.boss;
  }
}

export function isLawAmendmentRefreshSchedulerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return queueWorkerEnabled('LAW_AMENDMENT_REFRESH_WORKER_ENABLED', env);
}

export function lawAmendmentRefreshCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.LAW_AMENDMENT_REFRESH_CRON?.trim() || '0 18 * * *';
}

export function lawAmendmentRefreshScheduleOptions(): ScheduleOptions {
  return {
    key: lawAmendmentRefreshScheduleKey,
    tz: 'UTC',
    singletonKey: lawAmendmentRefreshScheduleKey,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 30 * 60,
    deadLetter: lawAmendmentRefreshDeadLetterQueueName,
  };
}

export function lawAmendmentRefreshWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function createStartedLawAmendmentRefreshBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'LAW_AMENDMENT_REFRESH_MIGRATE_ENABLED',
      createSchemaEnvName: 'LAW_AMENDMENT_REFRESH_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'LAW_AMENDMENT_REFRESH_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', () => {
    logger.warn({ code: 'LAW_AMENDMENT_REFRESH_QUEUE_ERROR' });
  });
  await boss.start();
  return boss;
}

export async function ensureLawAmendmentRefreshSchedule(
  boss: Pick<PgBoss, 'createQueue' | 'schedule'>,
): Promise<void> {
  await boss.createQueue(lawAmendmentRefreshDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(lawAmendmentRefreshQueueName, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: lawAmendmentRefreshDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.schedule(
    lawAmendmentRefreshQueueName,
    lawAmendmentRefreshCron(),
    { scope: 'law-amendment-refresh' },
    lawAmendmentRefreshScheduleOptions(),
  );
}
