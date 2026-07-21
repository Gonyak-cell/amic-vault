import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditAnchorDailyCron,
  auditAnchorDeadLetterQueueName,
  AuditAnchorJobService,
  type AuditAnchorJobPayload,
  auditAnchorQueueName,
  auditAnchorScheduleKey,
  auditAnchorScheduleOptions,
  isAuditAnchorQueueWorkerEnabled,
  previousUtcAnchorDate,
} from './audit-anchor-job.service';
import type { AuditAnchorRecord } from './audit-anchor.service';

interface FakeBoss {
  schedule: (name: string, cron: string, data?: object | null, options?: object) => Promise<void>;
  work: (
    name: string,
    options: object,
    handler: (jobs: Array<{ data: AuditAnchorJobPayload }>) => Promise<void>,
  ) => Promise<string>;
  stop: () => Promise<void>;
}

describe('AuditAnchorJobService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
  });

  it('uses PROCESS_ROLE as the default audit anchor worker activation contract', () => {
    delete process.env.AUDIT_ANCHOR_QUEUE_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isAuditAnchorQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isAuditAnchorQueueWorkerEnabled()).toBe(false);
  });

  it('keeps the legacy audit anchor worker flag as an explicit override', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.AUDIT_ANCHOR_QUEUE_WORKER_ENABLED = 'true';
    expect(isAuditAnchorQueueWorkerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'worker';
    process.env.AUDIT_ANCHOR_QUEUE_WORKER_ENABLED = 'false';
    expect(isAuditAnchorQueueWorkerEnabled()).toBe(false);
  });

  it('builds a UTC daily schedule for the previous audit day', () => {
    expect(previousUtcAnchorDate(new Date('2026-01-01T00:10:00.000Z'))).toBe('2025-12-31');
    expect(auditAnchorDailyCron({ AUDIT_ANCHOR_DAILY_CRON: '15 1 * * *' })).toBe('15 1 * * *');
    expect(auditAnchorScheduleOptions()).toMatchObject({
      key: auditAnchorScheduleKey,
      tz: 'UTC',
      singletonKey: auditAnchorScheduleKey,
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: auditAnchorDeadLetterQueueName,
    });
  });

  it('registers the daily schedule and records anchors for all active tenants', async () => {
    process.env.PROCESS_ROLE = 'worker';
    process.env.AUDIT_ANCHOR_QUEUE_WORKER_ENABLED = 'true';
    const tenantIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    const handlers = new Map<
      string,
      (jobs: Array<{ data: AuditAnchorJobPayload }>) => Promise<void>
    >();
    const boss: FakeBoss = {
      schedule: vi.fn(async () => undefined),
      work: vi.fn(async (name, _options, handler) => {
        handlers.set(name, handler);
        return `${name}-worker`;
      }),
      stop: vi.fn(async () => undefined),
    };
    const tenantReader = {
      listActiveTenantIds: vi.fn(async () => tenantIds),
    };
    const anchorService = {
      recordDailyAnchor: vi.fn(async (input: { tenantId: string; anchorDate: string }) =>
        anchorRecord(input.tenantId, input.anchorDate),
      ),
    };
    const queueRegistry = {
      register: vi.fn(),
      consumer: vi.fn(async () => boss),
    };
    const service = new AuditAnchorJobService(anchorService, tenantReader, queueRegistry as never);

    await service.onModuleInit();

    expect(queueRegistry.register).toHaveBeenCalledTimes(2);
    expect(queueRegistry.consumer).toHaveBeenCalledWith(auditAnchorQueueName);
    expect(boss.schedule).toHaveBeenCalledWith(
      auditAnchorQueueName,
      '10 0 * * *',
      { scope: 'previous-utc-day' },
      expect.objectContaining({ key: auditAnchorScheduleKey, tz: 'UTC' }),
    );
    await handlers.get(auditAnchorQueueName)?.([{ data: { anchorDate: '2026-01-02' } }]);

    expect(anchorService.recordDailyAnchor).toHaveBeenCalledTimes(tenantIds.length);
    expect(anchorService.recordDailyAnchor).toHaveBeenNthCalledWith(1, {
      tenantId: tenantIds[0],
      anchorDate: '2026-01-02',
    });
    expect(anchorService.recordDailyAnchor).toHaveBeenNthCalledWith(2, {
      tenantId: tenantIds[1],
      anchorDate: '2026-01-02',
    });
  });

  it('fails the job after attempting every tenant so pg-boss can retry idempotently', async () => {
    const tenantIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    const tenantReader = {
      listActiveTenantIds: vi.fn(async () => tenantIds),
    };
    const anchorService = {
      recordDailyAnchor: vi.fn(async (input: { tenantId: string; anchorDate: string }) => {
        if (input.tenantId === tenantIds[0]) throw new Error('temporary storage failure');
        return anchorRecord(input.tenantId, input.anchorDate);
      }),
    };
    const service = new AuditAnchorJobService(anchorService, tenantReader, {} as never);

    await expect(service.recordDailyAnchors({ anchorDate: '2026-01-02' })).rejects.toThrow(
      'audit anchor daily job failed for 1 tenant(s)',
    );

    expect(anchorService.recordDailyAnchor).toHaveBeenCalledTimes(tenantIds.length);
  });
});

function anchorRecord(tenantId: string, anchorDate: string): AuditAnchorRecord {
  return {
    anchorId: `${tenantId}:anchor`,
    tenantId,
    anchorDate,
    seqStart: null,
    seqEnd: null,
    eventCount: 0,
    eventsHash: '0'.repeat(64),
    previousAnchorHash: null,
    anchorHash: '1'.repeat(64),
    storageUri: null,
    recordedAuditEventId: null,
    createdAt: `${anchorDate}T00:00:00.000Z`,
  };
}
