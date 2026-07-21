import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { pgBossRuntimeOptions } from '../../common/db/pg-boss-runtime-options';
import { DatabaseService } from '../../common/db/database.service';
import { queueWorkerEnabled } from '../../common/process-role';
import {
  DocumentEditingService,
  type ExpiredEditSessionSweepResult,
} from './document-editing.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const editSessionSweepQueueName = 'document.edit-session.sweep';
export const editSessionSweepDeadLetterQueueName = 'document.edit-session.sweep.dead';
export const editSessionSweepScheduleKey = 'expired-edit-sessions';

export interface EditSessionSweepJobPayload {
  scope?: 'expired-edit-sessions';
  tenantId?: string;
  limit?: number;
}

export interface EditSessionSweepJobResult {
  tenantCount: number;
  expiredCount: number;
  failedCount: number;
  results: ExpiredEditSessionSweepResult[];
}

@Injectable()
export class EditSessionSweepTenantReader {
  constructor(private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<TenantId[]> {
    return (await this.databaseService.listActiveTenantRegistryIds()) as TenantId[];
  }
}

@Injectable()
export class EditSessionSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EditSessionSweeperService.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<PgBoss> | null = null;
  private workerRegistered = false;

  constructor(
    @Inject(DocumentEditingService)
    private readonly documentEditing: Pick<DocumentEditingService, 'sweepExpiredSessionsForTenant'>,
    @Inject(EditSessionSweepTenantReader)
    private readonly tenantReader: Pick<EditSessionSweepTenantReader, 'listActiveTenantIds'>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!isEditSessionSweeperEnabled()) return;
    await this.registerWorkers();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop();
  }

  async sweepExpiredEditSessions(
    payload: EditSessionSweepJobPayload = {},
  ): Promise<EditSessionSweepJobResult> {
    const tenantIds = payload.tenantId
      ? [payload.tenantId as TenantId]
      : await this.tenantReader.listActiveTenantIds();
    const results: ExpiredEditSessionSweepResult[] = [];
    const failedTenantIds: string[] = [];
    const failureMessages: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        const result = await this.documentEditing.sweepExpiredSessionsForTenant({
          tenantId,
          ...(payload.limit === undefined ? {} : { limit: payload.limit }),
        });
        results.push(result);
      } catch (error) {
        failedTenantIds.push(tenantId);
        failureMessages.push(error instanceof Error ? error.message : 'unknown');
      }
    }

    if (failedTenantIds.length > 0) {
      this.logger.warn({
        code: 'DOCUMENT_EDIT_SESSION_SWEEP_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failedTenantIds.length,
        failureMessages,
      });
      throw new Error(
        `edit session sweep failed for ${failedTenantIds.length} tenant(s): ${failureMessages.join(
          '; ',
        )}`,
      );
    }

    return {
      tenantCount: tenantIds.length,
      expiredCount: results.reduce((sum, result) => sum + result.expiredCount, 0),
      failedCount: 0,
      results,
    };
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureStarted();
    await ensureEditSessionSweepSchedule(boss);
    await boss.work<EditSessionSweepJobPayload>(
      editSessionSweepQueueName,
      editSessionSweepWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleSweepJob(job)));
      },
    );
    await boss.work<EditSessionSweepJobPayload>(
      editSessionSweepDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'DOCUMENT_EDIT_SESSION_SWEEP_DEAD_LETTER',
          scope: job.data?.scope ?? 'expired-edit-sessions',
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleSweepJob(job: Job<EditSessionSweepJobPayload>): Promise<void> {
    await this.sweepExpiredEditSessions(job.data ?? {});
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    this.startPromise ??= createStartedEditSessionSweepBoss(
      this.logger,
      'amic-vault-edit-session-sweeper',
    );
    this.boss = await this.startPromise;
    return this.boss;
  }
}

export function isEditSessionSweeperEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('EDIT_SESSION_SWEEPER_ENABLED', env);
}

export function editSessionSweepCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.EDIT_SESSION_SWEEP_CRON?.trim() || '*/5 * * * *';
}

export function editSessionSweepScheduleOptions(): ScheduleOptions {
  return {
    key: editSessionSweepScheduleKey,
    tz: 'UTC',
    singletonKey: editSessionSweepScheduleKey,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 10 * 60,
    deadLetter: editSessionSweepDeadLetterQueueName,
  };
}

export function editSessionSweepWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function createStartedEditSessionSweepBoss(
  logger: Pick<Logger, 'warn'>,
  applicationName: string,
): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...pgBossRuntimeOptions({
      applicationName,
      migrateEnvName: 'EDIT_SESSION_SWEEPER_MIGRATE_ENABLED',
      createSchemaEnvName: 'EDIT_SESSION_SWEEPER_CREATE_SCHEMA_ENABLED',
      superviseEnvName: 'EDIT_SESSION_SWEEPER_SUPERVISE_ENABLED',
    }),
  });
  boss.on('error', () => {
    logger.warn({ code: 'DOCUMENT_EDIT_SESSION_SWEEP_QUEUE_ERROR' });
  });
  await boss.start();
  return boss;
}

export async function ensureEditSessionSweepSchedule(
  boss: Pick<PgBoss, 'createQueue' | 'schedule'>,
): Promise<void> {
  await boss.createQueue(editSessionSweepDeadLetterQueueName, {
    retryLimit: 0,
    retentionSeconds: 7 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.createQueue(editSessionSweepQueueName, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: editSessionSweepDeadLetterQueueName,
    retentionSeconds: 14 * 24 * 60 * 60,
    deleteAfterSeconds: 7 * 24 * 60 * 60,
  });
  await boss.schedule(
    editSessionSweepQueueName,
    editSessionSweepCron(),
    { scope: 'expired-edit-sessions' },
    editSessionSweepScheduleOptions(),
  );
}
