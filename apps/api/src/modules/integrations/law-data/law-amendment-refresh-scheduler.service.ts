import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../../common/db/database.service';
import { QueueRegistry } from '../../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../../common/process-role';
import { LawDataService } from './law-data.service';

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
export class LawDataTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.databaseService.listActiveTenantRegistryIds();
  }
}

@Injectable()
export class LawAmendmentRefreshSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(LawAmendmentRefreshSchedulerService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(LawDataService)
    private readonly lawData: Pick<LawDataService, 'refreshStaleLawAuthoritiesForTenant'>,
    @Inject(LawDataTenantReader)
    private readonly tenantReader: Pick<LawDataTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isLawAmendmentRefreshSchedulerEnabled()) return;
    await this.registerWorkers();
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
    const boss = await this.ensureConsumerStarted();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({ name: lawAmendmentRefreshDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: lawAmendmentRefreshQueueName, options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, deadLetter: lawAmendmentRefreshDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(lawAmendmentRefreshQueueName);
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

export async function ensureLawAmendmentRefreshSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    lawAmendmentRefreshQueueName,
    lawAmendmentRefreshCron(),
    { scope: 'law-amendment-refresh' },
    lawAmendmentRefreshScheduleOptions(),
  );
}
