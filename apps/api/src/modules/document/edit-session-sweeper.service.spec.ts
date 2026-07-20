import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import {
  editSessionSweepCron,
  editSessionSweepDeadLetterQueueName,
  EditSessionSweeperService,
  type EditSessionSweepJobPayload,
  editSessionSweepQueueName,
  editSessionSweepScheduleKey,
  editSessionSweepScheduleOptions,
  isEditSessionSweeperEnabled,
} from './edit-session-sweeper.service';

interface FakeBoss {
  createQueue: (name: string, options?: object) => Promise<void>;
  schedule: (name: string, cron: string, data?: object | null, options?: object) => Promise<void>;
  work: (
    name: string,
    options: object,
    handler: (jobs: Array<{ data: EditSessionSweepJobPayload }>) => Promise<void>,
  ) => Promise<string>;
  stop: () => Promise<void>;
}

describe('EditSessionSweeperService', () => {
  const previousEnv = { ...process.env };
  const tenantAlpha = '11111111-1111-4111-8111-111111111111' as TenantId;
  const tenantBeta = '22222222-2222-4222-8222-222222222222' as TenantId;

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
  });

  it('uses PROCESS_ROLE as the default sweeper worker activation contract', () => {
    delete process.env.EDIT_SESSION_SWEEPER_ENABLED;

    process.env.PROCESS_ROLE = 'worker';
    expect(isEditSessionSweeperEnabled()).toBe(true);

    process.env.PROCESS_ROLE = 'api';
    expect(isEditSessionSweeperEnabled()).toBe(false);
  });

  it('keeps the sweeper flag and cron bounded', () => {
    process.env.PROCESS_ROLE = 'api';
    process.env.EDIT_SESSION_SWEEPER_ENABLED = 'true';
    expect(isEditSessionSweeperEnabled()).toBe(true);
    expect(editSessionSweepCron({ EDIT_SESSION_SWEEP_CRON: '*/2 * * * *' })).toBe(
      '*/2 * * * *',
    );
    expect(editSessionSweepScheduleOptions()).toMatchObject({
      key: editSessionSweepScheduleKey,
      tz: 'UTC',
      singletonKey: editSessionSweepScheduleKey,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: editSessionSweepDeadLetterQueueName,
    });
  });

  it('registers the scheduled sweep and expires active sessions for all tenants', async () => {
    process.env.EDIT_SESSION_SWEEPER_ENABLED = 'true';
    const handlers = new Map<
      string,
      (jobs: Array<{ data: EditSessionSweepJobPayload }>) => Promise<void>
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
    const documentEditing = {
      sweepExpiredSessionsForTenant: vi.fn(async (input: { tenantId: TenantId }) => ({
        tenantId: input.tenantId,
        expiredCount: input.tenantId === tenantAlpha ? 2 : 1,
      })),
    };
    const tenantReader = {
      listActiveTenantIds: vi.fn(async () => [tenantAlpha, tenantBeta]),
    };
    const service = new EditSessionSweeperService(documentEditing, tenantReader);
    (
      service as unknown as {
        ensureStarted: () => Promise<FakeBoss>;
      }
    ).ensureStarted = async () => boss;

    await service.onModuleInit();

    expect(boss.createQueue).toHaveBeenCalledWith(
      editSessionSweepDeadLetterQueueName,
      expect.objectContaining({ retryLimit: 0 }),
    );
    expect(boss.createQueue).toHaveBeenCalledWith(
      editSessionSweepQueueName,
      expect.objectContaining({ deadLetter: editSessionSweepDeadLetterQueueName }),
    );
    expect(boss.schedule).toHaveBeenCalledWith(
      editSessionSweepQueueName,
      '*/5 * * * *',
      { scope: 'expired-edit-sessions' },
      expect.objectContaining({ key: editSessionSweepScheduleKey, tz: 'UTC' }),
    );

    await handlers.get(editSessionSweepQueueName)?.([{ data: { scope: 'expired-edit-sessions' } }]);

    expect(documentEditing.sweepExpiredSessionsForTenant).toHaveBeenCalledTimes(2);
    expect(documentEditing.sweepExpiredSessionsForTenant).toHaveBeenNthCalledWith(1, {
      tenantId: tenantAlpha,
    });
    expect(documentEditing.sweepExpiredSessionsForTenant).toHaveBeenNthCalledWith(2, {
      tenantId: tenantBeta,
    });
  });

  it('fails the job after attempting every tenant so pg-boss can retry idempotently', async () => {
    const documentEditing = {
      sweepExpiredSessionsForTenant: vi.fn(async (input: { tenantId: TenantId }) => {
        if (input.tenantId === tenantBeta) throw new Error('tenant failed');
        return { tenantId: input.tenantId, expiredCount: 1 };
      }),
    };
    const tenantReader = {
      listActiveTenantIds: vi.fn(async () => [tenantAlpha, tenantBeta]),
    };
    const service = new EditSessionSweeperService(documentEditing, tenantReader);

    await expect(service.sweepExpiredEditSessions()).rejects.toThrow(
      'edit session sweep failed for 1 tenant(s)',
    );
    expect(documentEditing.sweepExpiredSessionsForTenant).toHaveBeenCalledTimes(2);
  });
});
