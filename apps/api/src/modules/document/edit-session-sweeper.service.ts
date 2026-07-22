import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import {
  DocumentEditingService,
  type ExpiredEditSessionSweepResult,
} from './document-editing.service';

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
export class EditSessionSweeperService implements OnModuleInit {
  private readonly logger = new Logger(EditSessionSweeperService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(DocumentEditingService)
    private readonly documentEditing: Pick<DocumentEditingService, 'sweepExpiredSessionsForTenant'>,
    @Inject(EditSessionSweepTenantReader)
    private readonly tenantReader: Pick<EditSessionSweepTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isEditSessionSweeperEnabled()) return;
    await this.registerWorkers();
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
    const boss = await this.ensureConsumerStarted();
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

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({
      name: editSessionSweepDeadLetterQueueName,
      options: {
        retryLimit: 0,
        retentionSeconds: 7 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueRegistry.register({
      name: editSessionSweepQueueName,
      options: {
        retryLimit: 3,
        retryDelay: 60,
        retryBackoff: true,
        deadLetter: editSessionSweepDeadLetterQueueName,
        retentionSeconds: 14 * 24 * 60 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
      },
    });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(editSessionSweepQueueName);
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

export async function ensureEditSessionSweepSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    editSessionSweepQueueName,
    editSessionSweepCron(),
    { scope: 'expired-edit-sessions' },
    editSessionSweepScheduleOptions(),
  );
}
