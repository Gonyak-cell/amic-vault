import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { LitigationService } from '../litigation/litigation.service';
import { NotificationsService } from './notifications.service';

export const litigationDeadlineNotificationSweepQueueName =
  'litigation.deadline-notification.sweep';
export const litigationDeadlineNotificationSweepDeadLetterQueueName =
  'litigation.deadline-notification.sweep.dead';
export const litigationDeadlineNotificationSweepScheduleKey = 'litigation-deadline-notifications';

export interface LitigationDeadlineNotificationSweepJobPayload {
  scope?: 'litigation-deadline-notifications';
  tenantId?: string;
}

export interface LitigationDeadlineNotificationSweepJobResult {
  tenantCount: number;
  refreshedCount: number;
  failedCount: number;
}

@Injectable()
export class LitigationDeadlineNotificationTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<TenantId[]> {
    return (await this.databaseService.listActiveTenantRegistryIds()) as TenantId[];
  }
}

@Injectable()
export class LitigationDeadlineNotificationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(LitigationDeadlineNotificationSchedulerService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(LitigationService)
    private readonly litigation: Pick<LitigationService, 'refreshLitigationDeadlineWorkForTenant'>,
    @Inject(NotificationsService)
    private readonly notifications: Pick<
      NotificationsService,
      'refreshLitigationDeadlineNotificationsForTenant'
    >,
    @Inject(LitigationDeadlineNotificationTenantReader)
    private readonly tenantReader: Pick<
      LitigationDeadlineNotificationTenantReader,
      'listActiveTenantIds'
    >,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isLitigationDeadlineNotificationSchedulerEnabled()) return;
    await this.registerWorkers();
  }

  async sweepLitigationDeadlineNotifications(
    payload: LitigationDeadlineNotificationSweepJobPayload = {},
  ): Promise<LitigationDeadlineNotificationSweepJobResult> {
    const tenantIds = payload.tenantId
      ? [payload.tenantId as TenantId]
      : await this.tenantReader.listActiveTenantIds();
    let refreshedCount = 0;
    const failureMessages: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        const work = await this.litigation.refreshLitigationDeadlineWorkForTenant(tenantId);
        const notifications =
          await this.notifications.refreshLitigationDeadlineNotificationsForTenant(tenantId);
        refreshedCount += work.refreshedCount + notifications.refreshedCount;
      } catch (error) {
        failureMessages.push(error instanceof Error ? error.message : 'unknown');
      }
    }

    if (failureMessages.length > 0) {
      this.logger.warn({
        code: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEP_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failureMessages.length,
      });
      throw new Error(
        `Litigation deadline notification sweep failed: ${failureMessages.join('; ')}`,
      );
    }

    return {
      tenantCount: tenantIds.length,
      refreshedCount,
      failedCount: 0,
    };
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await ensureLitigationDeadlineNotificationSweepSchedule(boss);
    await boss.work<LitigationDeadlineNotificationSweepJobPayload>(
      litigationDeadlineNotificationSweepQueueName,
      litigationDeadlineNotificationSweepWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleSweepJob(job)));
      },
    );
    await boss.work<LitigationDeadlineNotificationSweepJobPayload>(
      litigationDeadlineNotificationSweepDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEP_DEAD_LETTER',
          scope: job.data?.scope ?? 'litigation-deadline-notifications',
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleSweepJob(
    job: Job<LitigationDeadlineNotificationSweepJobPayload>,
  ): Promise<void> {
    await this.sweepLitigationDeadlineNotifications(job.data ?? {});
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({ name: litigationDeadlineNotificationSweepDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: litigationDeadlineNotificationSweepQueueName, options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, deadLetter: litigationDeadlineNotificationSweepDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(litigationDeadlineNotificationSweepQueueName);
  }
}

export function isLitigationDeadlineNotificationSchedulerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return queueWorkerEnabled('LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_ENABLED', env);
}

export function litigationDeadlineNotificationSweepCron(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.LITIGATION_DEADLINE_NOTIFICATION_SWEEP_CRON?.trim() || '*/10 * * * *';
}

export function litigationDeadlineNotificationSweepScheduleOptions(): ScheduleOptions {
  return {
    key: litigationDeadlineNotificationSweepScheduleKey,
    tz: 'UTC',
    singletonKey: litigationDeadlineNotificationSweepScheduleKey,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    deadLetter: litigationDeadlineNotificationSweepDeadLetterQueueName,
  };
}

export function litigationDeadlineNotificationSweepWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function ensureLitigationDeadlineNotificationSweepSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    litigationDeadlineNotificationSweepQueueName,
    litigationDeadlineNotificationSweepCron(),
    { scope: 'litigation-deadline-notifications' },
    litigationDeadlineNotificationSweepScheduleOptions(),
  );
}
