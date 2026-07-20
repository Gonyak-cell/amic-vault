import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '../audit/audit.service';
import {
  isRetentionSchedulerWorkerEnabled,
  retentionReviewCron,
  retentionReviewDeadLetterQueueName,
  type RetentionReviewJobPayload,
  retentionReviewQueueName,
  retentionReviewScheduleKey,
  retentionReviewScheduleOptions,
  RetentionSchedulerService,
} from './retention-scheduler.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const documentId = '11111111-1111-4111-8111-111111111122';
const matterId = '11111111-1111-4111-8111-111111111133';
const retentionPolicyId = '11111111-1111-4111-8111-111111111144';
const schedulerUserId = '11111111-1111-4111-8111-111111111155';
const disposalRequestId = '11111111-1111-4111-8111-111111111166';
const workItemId = '11111111-1111-4111-8111-111111111177';
const auditEventId = '11111111-1111-4111-8111-111111111188';

interface FakeBoss {
  createQueue: (name: string, options?: object) => Promise<void>;
  schedule: (name: string, cron: string, data?: object | null, options?: object) => Promise<void>;
  work: (
    name: string,
    options: object,
    handler: (jobs: Array<{ data: RetentionReviewJobPayload }>) => Promise<void>,
  ) => Promise<string>;
  stop: () => Promise<void>;
}

describe('RetentionSchedulerService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
  });

  it('uses PROCESS_ROLE as the default retention scheduler activation contract', () => {
    delete process.env.RETENTION_REVIEW_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isRetentionSchedulerWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isRetentionSchedulerWorkerEnabled()).toBe(false);
  });

  it('builds the nightly UTC schedule with retry and dead-letter options', () => {
    expect(retentionReviewCron({ RETENTION_REVIEW_CRON: '45 1 * * *' })).toBe('45 1 * * *');
    expect(retentionReviewScheduleOptions()).toMatchObject({
      key: retentionReviewScheduleKey,
      tz: 'UTC',
      singletonKey: retentionReviewScheduleKey,
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: retentionReviewDeadLetterQueueName,
    });
  });

  it('registers queues and runs expired retention review jobs', async () => {
    process.env.RETENTION_REVIEW_QUEUE_WORKER_ENABLED = 'true';
    const handlers = new Map<
      string,
      (jobs: Array<{ data: RetentionReviewJobPayload }>) => Promise<void>
    >();
    const boss: FakeBoss = {
      createQueue: vi.fn(async () => undefined),
      schedule: vi.fn(async () => undefined),
      work: vi.fn(async (name, _options, handler) => {
        handlers.set(name, handler);
        return `${name}-worker`;
      }),
      stop: vi.fn(async () => undefined),
    };
    const { service, tx, auditLog, workService } = serviceWithTransaction();
    (
      service as unknown as {
        ensureStarted: () => Promise<FakeBoss>;
      }
    ).ensureStarted = async () => boss;

    await service.onModuleInit();

    expect(boss.createQueue).toHaveBeenCalledWith(
      retentionReviewDeadLetterQueueName,
      expect.objectContaining({ retryLimit: 0 }),
    );
    expect(boss.createQueue).toHaveBeenCalledWith(
      retentionReviewQueueName,
      expect.objectContaining({ deadLetter: retentionReviewDeadLetterQueueName }),
    );
    expect(boss.schedule).toHaveBeenCalledWith(
      retentionReviewQueueName,
      '30 0 * * *',
      { scope: 'expired-matters' },
      expect.objectContaining({ key: retentionReviewScheduleKey, tz: 'UTC' }),
    );

    await handlers.get(retentionReviewQueueName)?.([
      { data: { asOf: '2026-01-03T00:00:00.000Z' } },
    ]);

    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('FROM documents d'), [
      tenantId,
      new Date('2026-01-03T00:00:00.000Z'),
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RETENTION_REVIEW_SCHEDULED',
        actorType: 'system',
        actorId: null,
        targetId: documentId,
        metadata: expect.objectContaining({
          disposal_request_id: disposalRequestId,
          retention_policy_id: retentionPolicyId,
          reason_code: 'RETENTION_EXPIRED',
        }),
      }),
      tx,
    );
    expect(workService.openRecordsDisposalWork).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId,
        disposalRequestId,
        matterId,
        documentId,
        actorUserId: schedulerUserId,
        auditEventId,
        kind: 'records_disposal_approval',
      }),
    );
  });

  it('is idempotent when a candidate already has an active disposal request', async () => {
    const { service, tx, auditLog, workService } = serviceWithTransaction({ insertRows: [] });

    const result = await service.scheduleExpiredRetentionReviews({
      asOf: new Date('2026-01-03T00:00:00.000Z'),
      tenantIds: [tenantId],
    });

    expect(result).toMatchObject({ tenantCount: 1, reviewedTenantCount: 1, scheduledCount: 0 });
    expect(auditLog).not.toHaveBeenCalled();
    expect(workService.openRecordsDisposalWork).not.toHaveBeenCalled();
    expect(tx.query).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['closed date is absent', 'm.closed_at IS NOT NULL'],
    [
      'matter and document retention policy are unbound',
      'rp.retention_policy_id = coalesce(d.retention_policy_id, m.retention_policy_id)',
    ],
    ['retention_days is NULL', 'rp.retention_days IS NOT NULL'],
  ])('skips expired review scheduling when %s', async (_caseName, requiredPredicate) => {
    const { service, tx, auditLog, workService } = serviceWithTransaction({ candidateRows: [] });

    const result = await service.scheduleExpiredRetentionReviews({
      asOf: new Date('2026-01-03T00:00:00.000Z'),
      tenantIds: [tenantId],
    });

    expect(result).toMatchObject({ tenantCount: 1, reviewedTenantCount: 1, scheduledCount: 0 });
    expect(tx.query.mock.calls[0]?.[0]).toEqual(expect.stringContaining(requiredPredicate));
    expect(auditLog).not.toHaveBeenCalled();
    expect(workService.openRecordsDisposalWork).not.toHaveBeenCalled();
    expect(tx.query).toHaveBeenCalledTimes(1);
  });
});

function serviceWithTransaction(
  options: { candidateRows?: unknown[]; insertRows?: unknown[] } = {},
) {
  const tx = {
    query: vi
      .fn()
      .mockResolvedValueOnce({
        rows: options.candidateRows ?? [
          {
            document_id: documentId,
            matter_id: matterId,
            retention_policy_id: retentionPolicyId,
            retention_days: 1,
            previous_status: 'archived',
            scheduler_user_id: schedulerUserId,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: options.insertRows ?? [{ disposal_request_id: disposalRequestId }],
        rowCount: options.insertRows?.length ?? 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
  };
  const auditLog = vi.fn(async () => ({
    eventId: auditEventId,
    createdAt: new Date('2026-01-03T00:00:00.000Z'),
  }));
  const auditService = {
    log: auditLog,
    transaction: vi.fn(async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
      run(tx as unknown as QueryClient),
    ),
  };
  const workService = {
    openRecordsDisposalWork: vi.fn(async () => ({
      workItemId,
      dueAt: new Date('2026-01-10T00:00:00.000Z'),
    })),
  };
  const tenantReader = {
    listActiveTenantIds: vi.fn(async () => [tenantId]),
  };
  const service = new RetentionSchedulerService(
    auditService as never,
    workService as never,
    tenantReader,
  );
  return { service, tx, auditLog, workService };
}
