import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss, ScheduleOptions, WorkOptions } from 'pg-boss';
import { DatabaseService } from '../../common/db/database.service';
import { QueueRegistry } from '../../common/queue/queue.registry';
import { currentProcessRole, queueWorkerEnabled } from '../../common/process-role';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { WorkService } from '../work/work.service';

export const retentionReviewQueueName = 'records.retention.review';
export const retentionReviewDeadLetterQueueName = 'records.retention.review.dead';
export const retentionReviewScheduleKey = 'nightly-utc';

interface RetentionReviewCandidateRow {
  document_id: string;
  matter_id: string;
  retention_policy_id: string;
  retention_days: number;
  previous_status: string;
  scheduler_user_id: string;
}

interface DisposalRequestInsertRow {
  disposal_request_id: string;
}

export interface RetentionReviewJobPayload {
  scope?: 'expired-matters';
  asOf?: string;
}

export interface RetentionReviewJobResult {
  tenantCount: number;
  reviewedTenantCount: number;
  scheduledCount: number;
}

@Injectable()
export class RetentionTenantReader {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.databaseService.listActiveTenantRegistryIds();
  }
}

@Injectable()
export class RetentionSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RetentionSchedulerService.name);
  private queueDefinitionsRegistered = false;
  private workerRegistered = false;

  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(WorkService) private readonly workService: WorkService,
    @Inject(RetentionTenantReader)
    private readonly tenantReader: Pick<RetentionTenantReader, 'listActiveTenantIds'>,
    @Inject(QueueRegistry) private readonly queueRegistry: QueueRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerQueueDefinitions();
    if (currentProcessRole() !== 'worker' || !isRetentionSchedulerWorkerEnabled()) return;
    await this.registerWorkers();
  }

  async scheduleExpiredRetentionReviews(input: {
    asOf?: Date;
    tenantIds?: readonly string[];
  } = {}): Promise<RetentionReviewJobResult> {
    const tenantIds = [...(input.tenantIds ?? (await this.tenantReader.listActiveTenantIds()))];
    const asOf = input.asOf ?? new Date();
    let scheduledCount = 0;
    let reviewedTenantCount = 0;
    const failedTenantIds: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        const tenantScheduledCount = await this.scheduleExpiredRetentionReviewsForTenant(
          tenantId,
          asOf,
        );
        scheduledCount += tenantScheduledCount;
        reviewedTenantCount += 1;
      } catch {
        failedTenantIds.push(tenantId);
      }
    }

    if (failedTenantIds.length > 0) {
      this.logger.warn({
        code: 'RETENTION_REVIEW_SCHEDULER_PARTIAL_FAILURE',
        tenantCount: tenantIds.length,
        failedCount: failedTenantIds.length,
      });
      throw new Error(`retention review scheduler failed for ${failedTenantIds.length} tenant(s)`);
    }

    return { tenantCount: tenantIds.length, reviewedTenantCount, scheduledCount };
  }

  private async scheduleExpiredRetentionReviewsForTenant(
    tenantId: string,
    asOf: Date,
  ): Promise<number> {
    return this.auditService.transaction(tenantId, async (client) => {
      const candidates = await this.findRetentionReviewCandidates(client, tenantId, asOf);
      let scheduledCount = 0;

      for (const candidate of candidates) {
        const disposalRequestId = await this.insertRetentionReviewRequest(
          client,
          tenantId,
          candidate,
        );
        if (!disposalRequestId) continue;
        const audit = await this.auditService.log(
          {
            tenantId,
            actorType: 'system',
            actorId: null,
            action: 'RETENTION_REVIEW_SCHEDULED',
            targetType: 'document',
            targetId: candidate.document_id,
            matterId: candidate.matter_id,
            metadata: {
              disposal_request_id: disposalRequestId,
              matter_id: candidate.matter_id,
              document_id: candidate.document_id,
              retention_policy_id: candidate.retention_policy_id,
              retention_days: candidate.retention_days,
              status_before: candidate.previous_status,
              status_after: 'disposal_locked',
              reason_code: 'RETENTION_EXPIRED',
            },
          },
          client,
        );
        const workItem = await this.workService.openRecordsDisposalWork(client, {
          tenantId,
          disposalRequestId,
          matterId: candidate.matter_id,
          documentId: candidate.document_id,
          actorUserId: candidate.scheduler_user_id,
          auditEventId: audit.eventId,
          kind: 'records_disposal_approval',
        });
        await attachDisposalWorkflow(client, {
          tenantId,
          disposalRequestId,
          workItemId: workItem.workItemId,
          dueAt: workItem.dueAt,
          auditEventId: audit.eventId,
        });
        scheduledCount += 1;
      }

      return scheduledCount;
    });
  }

  private async findRetentionReviewCandidates(
    client: QueryClient,
    tenantId: string,
    asOf: Date,
  ): Promise<RetentionReviewCandidateRow[]> {
    const result = await client.query(
      `
        SELECT
          d.document_id::text AS document_id,
          d.matter_id::text AS matter_id,
          rp.retention_policy_id::text AS retention_policy_id,
          rp.retention_days,
          d.status AS previous_status,
          scheduler.user_id::text AS scheduler_user_id
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
         AND m.matter_id = d.matter_id
        JOIN retention_policies rp
          ON rp.tenant_id = d.tenant_id
         AND rp.retention_policy_id = coalesce(d.retention_policy_id, m.retention_policy_id)
        JOIN LATERAL (
          SELECT user_id
          FROM users
          WHERE tenant_id = d.tenant_id
            AND status = 'active'
            AND role IN ('firm_admin', 'security_admin')
          ORDER BY CASE role WHEN 'firm_admin' THEN 0 ELSE 1 END, user_id
          LIMIT 1
        ) scheduler ON TRUE
        WHERE d.tenant_id = $1
          AND m.closed_at IS NOT NULL
          AND m.status IN ('closed', 'archived', 'disposal_review')
          AND rp.status = 'active'
          AND rp.retention_days IS NOT NULL
          AND m.closed_at + (rp.retention_days * interval '1 day') <= $2::timestamptz
          AND d.status IN (
            'draft',
            'internal_review',
            'client_sent',
            'counterparty_sent',
            'markup_received',
            'negotiation',
            'final',
            'executed',
            'archived'
          )
          AND d.legal_hold = false
          AND m.legal_hold = false
          AND NOT EXISTS (
            SELECT 1
            FROM legal_holds lh
            WHERE lh.tenant_id = d.tenant_id
              AND lh.status = 'active'
              AND (
                (lh.hold_scope = 'matter' AND lh.matter_id = d.matter_id)
                OR (lh.hold_scope = 'document' AND lh.document_id = d.document_id)
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM disposal_requests dr
            WHERE dr.tenant_id = d.tenant_id
              AND dr.document_id = d.document_id
              AND dr.status IN ('requested', 'approved')
          )
        ORDER BY m.closed_at ASC, d.created_at ASC, d.document_id
        LIMIT 250
        FOR UPDATE OF d SKIP LOCKED
      `,
      [tenantId, asOf],
    );
    return result.rows as RetentionReviewCandidateRow[];
  }

  private async insertRetentionReviewRequest(
    client: QueryClient,
    tenantId: string,
    candidate: RetentionReviewCandidateRow,
  ): Promise<string | null> {
    const result = await client.query(
      `
        WITH inserted AS (
          INSERT INTO disposal_requests (
            tenant_id, matter_id, document_id, reason_code, requested_by
          )
          SELECT $1, $2, $3, 'RETENTION_EXPIRED', $4
          WHERE NOT EXISTS (
            SELECT 1
            FROM disposal_requests dr
            WHERE dr.tenant_id = $1
              AND dr.document_id = $3
              AND dr.status IN ('requested', 'approved')
          )
          RETURNING disposal_request_id
        ),
        locked_document AS (
          UPDATE documents d
          SET status = 'disposal_locked',
            updated_at = now()
          FROM inserted
          WHERE d.tenant_id = $1
            AND d.document_id = $3
          RETURNING d.document_id
        )
        SELECT disposal_request_id::text AS disposal_request_id
        FROM inserted
      `,
      [tenantId, candidate.matter_id, candidate.document_id, candidate.scheduler_user_id],
    );
    return ((result.rows[0] as DisposalRequestInsertRow | undefined)?.disposal_request_id) ?? null;
  }

  private async registerWorkers(): Promise<void> {
    if (this.workerRegistered) return;
    const boss = await this.ensureConsumerStarted();
    await ensureRetentionReviewSchedule(boss);
    await boss.work<RetentionReviewJobPayload>(
      retentionReviewQueueName,
      retentionReviewWorkOptions(),
      async (jobs) => {
        await Promise.all(jobs.map((job) => this.handleRetentionReviewJob(job)));
      },
    );
    await boss.work<RetentionReviewJobPayload>(
      retentionReviewDeadLetterQueueName,
      { batchSize: 1, pollingIntervalSeconds: 5 },
      async ([job]) => {
        if (!job) return;
        this.logger.warn({
          code: 'RETENTION_REVIEW_JOB_DEAD_LETTER',
          asOf: job.data.asOf ?? null,
        });
      },
    );
    this.workerRegistered = true;
  }

  private async handleRetentionReviewJob(job: Job<RetentionReviewJobPayload>): Promise<void> {
    const asOf = parseAsOf(job.data.asOf);
    await this.scheduleExpiredRetentionReviews(asOf ? { asOf } : {});
  }

  private registerQueueDefinitions(): void {
    if (this.queueDefinitionsRegistered) return;
    this.queueRegistry.register({ name: retentionReviewDeadLetterQueueName, options: { retryLimit: 0, retentionSeconds: 7 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueRegistry.register({ name: retentionReviewQueueName, options: { retryLimit: 5, retryDelay: 60, retryBackoff: true, deadLetter: retentionReviewDeadLetterQueueName, retentionSeconds: 14 * 24 * 60 * 60, deleteAfterSeconds: 7 * 24 * 60 * 60 } });
    this.queueDefinitionsRegistered = true;
  }

  private async ensureConsumerStarted() {
    this.registerQueueDefinitions();
    return this.queueRegistry.consumer(retentionReviewQueueName);
  }
}

export function isRetentionSchedulerWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return queueWorkerEnabled('RETENTION_REVIEW_QUEUE_WORKER_ENABLED', env);
}

export function retentionReviewCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.RETENTION_REVIEW_CRON?.trim() || '30 0 * * *';
}

export function retentionReviewScheduleOptions(): ScheduleOptions {
  return {
    key: retentionReviewScheduleKey,
    tz: 'UTC',
    singletonKey: retentionReviewScheduleKey,
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 60 * 60,
    deadLetter: retentionReviewDeadLetterQueueName,
  };
}

export function retentionReviewWorkOptions(): WorkOptions {
  return {
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  };
}

export async function ensureRetentionReviewSchedule(
  boss: Pick<PgBoss, 'schedule'>,
): Promise<void> {
  await boss.schedule(
    retentionReviewQueueName,
    retentionReviewCron(),
    { scope: 'expired-matters' },
    retentionReviewScheduleOptions(),
  );
}

function parseAsOf(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('asOf must be an ISO timestamp');
  return parsed;
}

async function attachDisposalWorkflow(
  client: QueryClient,
  input: {
    tenantId: string;
    disposalRequestId: string;
    workItemId: string;
    dueAt: Date;
    auditEventId: string;
  },
): Promise<void> {
  const result = await client.query(
    `
      UPDATE disposal_requests
      SET workflow_item_id = $3,
        workflow_audit_event_id = $4,
        due_at = $5,
        updated_at = now()
      WHERE tenant_id = $1
        AND disposal_request_id = $2
    `,
    [input.tenantId, input.disposalRequestId, input.workItemId, input.auditEventId, input.dueAt],
  );
  if ((result.rowCount ?? 0) !== 1) throw new Error('retention disposal workflow attach failed');
}
