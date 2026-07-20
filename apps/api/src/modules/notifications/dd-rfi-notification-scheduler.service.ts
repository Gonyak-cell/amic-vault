import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { Pool } from 'pg';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../common/process-role';
import { NotificationsService } from './notifications.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

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
export class DdRfiNotificationTenantReader implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: databaseUrl });

  async listActiveTenantIds(): Promise<TenantId[]> {
    const result = await this.pool.query<{ tenant_id: string }>(
      `
        SELECT tenant_id::text AS tenant_id
        FROM tenants
        WHERE status = 'active'
        ORDER BY tenant_id ASC
      `,
    );
    return result.rows.map((row) => row.tenant_id as TenantId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Injectable()
export class DdRfiNotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DdRfiNotificationSchedulerService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(NotificationsService)
    private readonly notifications: Pick<NotificationsService, 'refreshDdRfiNotificationsForTenant'>,
    @Inject(DdRfiNotificationTenantReader)
    private readonly tenantReader: Pick<DdRfiNotificationTenantReader, 'listActiveTenantIds'>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isDdRfiNotificationSchedulerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
    const boss = await this.ensureStarted();
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

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedDdRfiNotificationBoss(
      this.logger,
      'amic-vault-dd-rfi-notification-worker',
    );
    this.boss = await this.startPromise;
    return this.boss;
  }
}

export function isDdRfiNotificationSchedulerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
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

export async function createStartedDdRfiNotificationBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'DD_RFI_NOTIFICATION_SWEEPER_MIGRATE_ENABLED',
      createSchemaEnvName: 'DD_RFI_NOTIFICATION_SWEEPER_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'DD_RFI_NOTIFICATION_SWEEPER_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', () => {
    logger.warn({ code: 'DD_RFI_NOTIFICATION_SWEEP_QUEUE_ERROR' });
  });
  await boss.start();
  return boss;
}

export async function ensureDdRfiNotificationSweepSchedule(
  boss: Pick<PgBoss, 'createQueue' | 'schedule'>,
): Promise<void> {
  await boss.createQueue(ddRfiNotificationSweepDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(ddRfiNotificationSweepQueueName, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: ddRfiNotificationSweepDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.schedule(
    ddRfiNotificationSweepQueueName,
    ddRfiNotificationSweepCron(),
    { scope: 'dd-rfi-notifications' },
    ddRfiNotificationSweepScheduleOptions(),
  );
}
