import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { NotificationsService } from './notifications.service';

export const ddRfiNotificationSweepQueueName = 'dd.rfi-notification.sweep';
export const ddRfiNotificationSweepDeadLetterQueueName = 'dd.rfi-notification.sweep.dead';
export const ddRfiNotificationSweepScheduleKey = 'dd-rfi-notifications';

export interface DdRfiNotificationSweepJobPayload {
  scope?: 'dd-rfi-notifications';
  tenantId?: string;
}

export interface DdRfiNotificationSweepJobResult {
  tenantCount: number;
  refreshedCount: number;
  failedCount: number;
}

@Injectable()
export class DdRfiNotificationTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<TenantId[]> {
    return (await this.databaseService.listActiveTenantRegistryIds()) as TenantId[];
  }
}

@Injectable()
export class DdRfiNotificationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(DdRfiNotificationSchedulerService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(NotificationsService)
    private readonly notifications: Pick<
      NotificationsService,
      'refreshDdRfiNotificationsForTenant'
    >,
    @Inject(DdRfiNotificationTenantReader)
    private readonly tenantReader: Pick<DdRfiNotificationTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isDdRfiNotificationSchedulerEnabled()) return;
    await this.registerWorkers();
  }

  async sweepDdRfiNotifications(
    payload: DdRfiNotificationSweepJobPayload = {},
  ): Promise<DdRfiNotificationSweepJobResult> {
    const tenantIds = payload.tenantId
      ? [payload.tenantId as TenantId]
      : await this.tenantReader.listActiveTenantIds();
    let refreshedCount = 0;
    const failureMessages: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        const result = await this.notifications.refreshDdRfiNotificationsForTenant(tenantId);
        refreshedCount += result.refreshedCount;
      } catch (error) {
        failureMessages.push(error instanceof Error ? error.message : 'unknown');
      }
    }

    if (failureMessages.length > 0) {
      this.logger.warn({
        code: 'DD_RFI_NOTIFICATION_SWEEP_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failureMessages.length,
      });
      throw new Error(`DD RFI notification sweep failed: ${failureMessages.join('; ')}`);
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
    await ensureDdRfiNotificationSweepSchedule(boss);
    await boss.work<DdRfiNotificationSweepJobPayload>(
      ddRfiNotificationSweepQueueName,
      ddRfiNotificationSweepWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleSweepJob(job)));
      },
    );
    await boss.work<DdRfiNotificationSweepJobPayload>(
      ddRfiNotificationSweepDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'DD_RFI_NOTIFICATION_SWEEP_DEAD_LETTER',
          scope: job.data?.scope ?? 'dd-rfi-notifications',
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleSweepJob(job: Job<DdRfiNotificationSweepJobPayload>): Promise<void> {
    await this.sweepDdRfiNotifications(job.data ?? {});
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({ name: ddRfiNotificationSweepDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: ddRfiNotificationSweepQueueName, options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, deadLetter: ddRfiNotificationSweepDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(ddRfiNotificationSweepQueueName);
  }
}

export function isDdRfiNotificationSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('DD_RFI_NOTIFICATION_SWEEPER_ENABLED', env);
}

export function ddRfiNotificationSweepCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.DD_RFI_NOTIFICATION_SWEEP_CRON?.trim() || '*/10 * * * *';
}

export function ddRfiNotificationSweepScheduleOptions(): ScheduleOptions {
  return {
    key: ddRfiNotificationSweepScheduleKey,
    tz: 'UTC',
    singletonKey: ddRfiNotificationSweepScheduleKey,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    deadLetter: ddRfiNotificationSweepDeadLetterQueueName,
  };
}

export function ddRfiNotificationSweepWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function ensureDdRfiNotificationSweepSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    ddRfiNotificationSweepQueueName,
    ddRfiNotificationSweepCron(),
    { scope: 'dd-rfi-notifications' },
    ddRfiNotificationSweepScheduleOptions(),
  );
}
