import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { Pool } from 'pg';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { queueWorkerEnabled } from '../../common/process-role';
import { LitigationService } from '../litigation/litigation.service';
import { NotificationsService } from './notifications.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

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
export class LitigationDeadlineNotificationTenantReader implements OnModuleDestroy {
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
export class LitigationDeadlineNotificationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LitigationDeadlineNotificationSchedulerService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
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
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isLitigationDeadlineNotificationSchedulerEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
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
      throw new Error(`Litigation deadline notification sweep failed: ${failureMessages.join('; ')}`);
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

  private async handleSweepJob(job: Job<LitigationDeadlineNotificationSweepJobPayload>): Promise<void> {
    await this.sweepLitigationDeadlineNotifications(job.data ?? {});
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedLitigationDeadlineNotificationBoss(
      this.logger,
      'amic-vault-litigation-deadline-notification-worker',
    );
    this.boss = await this.startPromise;
    return this.boss;
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

export async function createStartedLitigationDeadlineNotificationBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_MIGRATE_ENABLED',
      createSchemaEnvName: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEPER_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', () => {
    logger.warn({ code: 'LITIGATION_DEADLINE_NOTIFICATION_SWEEP_QUEUE_ERROR' });
  });
  await boss.start();
  return boss;
}

export async function ensureLitigationDeadlineNotificationSweepSchedule(
  boss: Pick<PgBoss, 'createQueue' | 'schedule'>,
): Promise<void> {
  await boss.createQueue(litigationDeadlineNotificationSweepDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(litigationDeadlineNotificationSweepQueueName, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: litigationDeadlineNotificationSweepDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.schedule(
    litigationDeadlineNotificationSweepQueueName,
    litigationDeadlineNotificationSweepCron(),
    { scope: 'litigation-deadline-notifications' },
    litigationDeadlineNotificationSweepScheduleOptions(),
  );
}
