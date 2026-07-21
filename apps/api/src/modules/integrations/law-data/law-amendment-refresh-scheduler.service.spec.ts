import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isLawAmendmentRefreshSchedulerEnabled,
  lawAmendmentRefreshCron,
  lawAmendmentRefreshDeadLetterQueueName,
  type LawAmendmentRefreshJobPayload,
  lawAmendmentRefreshQueueName,
  lawAmendmentRefreshScheduleKey,
  lawAmendmentRefreshScheduleOptions,
  LawAmendmentRefreshSchedulerService,
} from './law-amendment-refresh-scheduler.service';

const tenantId = '11111111-1111-4111-8111-111111111111';

interface FakeBoss {
  createQueue: (name: string, options?: object) => Promise<void>;
  schedule: (name: string, cron: string, data?: object | null, options?: object) => Promise<void>;
  work: (
    name: string,
    options: object,
    handler: (jobs: Array<{ data: LawAmendmentRefreshJobPayload }>) => Promise<void>,
  ) => Promise<string>;
  stop: () => Promise<void>;
}

describe('LawAmendmentRefreshSchedulerService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
  });

  it('uses PROCESS_ROLE as the default law amendment scheduler activation contract', () => {
    delete process.env.LAW_AMENDMENT_REFRESH_WORKER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isLawAmendmentRefreshSchedulerEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isLawAmendmentRefreshSchedulerEnabled()).toBe(false);
  });

  it('builds the daily UTC schedule with retry and dead-letter options', () => {
    expect(lawAmendmentRefreshCron({ LAW_AMENDMENT_REFRESH_CRON: '15 3 * * *' })).toBe(
      '15 3 * * *',
    );
    expect(lawAmendmentRefreshScheduleOptions()).toMatchObject({
      key: lawAmendmentRefreshScheduleKey,
      tz: 'UTC',
      singletonKey: lawAmendmentRefreshScheduleKey,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: lawAmendmentRefreshDeadLetterQueueName,
    });
  });

  it('registers queues and runs law amendment refresh jobs', async () => {
    process.env.LAW_AMENDMENT_REFRESH_WORKER_ENABLED = 'true';
    const handlers = new Map<
      string,
      (jobs: Array<{ data: LawAmendmentRefreshJobPayload }>) => Promise<void>
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
    const lawData = {
      refreshStaleLawAuthoritiesForTenant: vi.fn(async () => ({
        selectedCount: 2,
        refreshedCount: 1,
        skippedCount: 1,
        notConfigured: false,
      })),
    };
    const service = new LawAmendmentRefreshSchedulerService(lawData, {
      listActiveTenantIds: vi.fn(async () => [tenantId]),
    });
    (
      service as unknown as {
        ensureStarted: () => Promise<FakeBoss>;
      }
    ).ensureStarted = async () => boss;

    await service.onModuleInit();

    expect(boss.createQueue).toHaveBeenCalledWith(
      lawAmendmentRefreshDeadLetterQueueName,
      expect.objectContaining({ retryLimit: 0 }),
    );
    expect(boss.createQueue).toHaveBeenCalledWith(
      lawAmendmentRefreshQueueName,
      expect.objectContaining({ deadLetter: lawAmendmentRefreshDeadLetterQueueName }),
    );
    expect(boss.schedule).toHaveBeenCalledWith(
      lawAmendmentRefreshQueueName,
      '0 18 * * *',
      { scope: 'law-amendment-refresh' },
      expect.objectContaining({ key: lawAmendmentRefreshScheduleKey, tz: 'UTC' }),
    );

    await handlers.get(lawAmendmentRefreshQueueName)?.([
      {
        data: {
          tenantId,
          limit: 2,
          staleBefore: '2026-07-05T00:00:00.000Z',
        },
      },
    ]);

    expect(lawData.refreshStaleLawAuthoritiesForTenant).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        limit: 2,
        staleBefore: new Date('2026-07-05T00:00:00.000Z'),
      }),
    );
  });
});
