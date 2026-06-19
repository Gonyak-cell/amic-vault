import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiPrepQueueService,
  aiPrepCanaryTenantIds,
  aiPrepEnabled,
  aiPrepGateFailureReason,
  aiPrepQueueExpireSeconds,
  aiPrepQueueSendOptions,
  aiPrepQueueWorkOptions,
  aiPrepTenantConcurrencyAllows,
  aiPrepTenantAllowed,
  defaultAiPrepArtifactKinds,
} from './ai-prep-queue.service';
import type { AiPrepJobPayload } from './ai-prep.types';

const payload: AiPrepJobPayload = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  matterId: '11111111-1111-4111-8111-111111111112',
  documentId: '11111111-1111-4111-8111-111111111113',
  versionId: '11111111-1111-4111-8111-111111111114',
  artifactKind: 'document_profile',
};
const matterId = '11111111-1111-4111-8111-111111111112';

describe('AiPrepQueueService options', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('uses singleton jobs, retries, exponential backoff, and a dead letter queue', () => {
    const client = { query: vi.fn() };
    expect(aiPrepQueueSendOptions(payload, client as never)).toMatchObject({
      singletonKey: `${payload.versionId}:document_profile`,
      group: { id: 'local_gemma' },
      expireInSeconds: 420,
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: 'ai.prep.dead',
    });
  });

  it('serializes local Gemma prep workers globally', () => {
    process.env.AI_PREP_QUEUE_BATCH_SIZE = '4';

    expect(aiPrepQueueWorkOptions()).toMatchObject({
      batchSize: 4,
      localConcurrency: 1,
      groupConcurrency: 1,
      pollingIntervalSeconds: 1,
    });
  });

  it('bounds active worker leases near the local Gemma timeout', () => {
    delete process.env.AI_PREP_QUEUE_EXPIRE_SECONDS;
    process.env.LOCAL_GEMMA_TIMEOUT_MS = '300000';
    expect(aiPrepQueueExpireSeconds()).toBe(420);

    process.env.LOCAL_GEMMA_TIMEOUT_MS = '600000';
    expect(aiPrepQueueExpireSeconds()).toBe(660);

    process.env.AI_PREP_QUEUE_EXPIRE_SECONDS = '180';
    expect(aiPrepQueueExpireSeconds()).toBe(180);
  });

  it('defaults to bounded high-value artifact kinds', () => {
    expect(defaultAiPrepArtifactKinds()).toEqual([
      'document_profile',
      'key_fields',
      'keyword_tags',
      'filing_suggestions',
    ]);
  });

  it('enforces per-tenant concurrency accounting', () => {
    expect(
      aiPrepTenantConcurrencyAllows(new Map([[payload.tenantId, 1]]), payload.tenantId, 1),
    ).toBe(false);
    expect(
      aiPrepTenantConcurrencyAllows(new Map([[payload.tenantId, 1]]), payload.tenantId, 2),
    ).toBe(true);
  });

  it('keeps ai prep disabled unless explicitly enabled', () => {
    delete process.env.AI_PREP_ENABLED;
    expect(aiPrepEnabled()).toBe(false);
    expect(aiPrepGateFailureReason(payload.tenantId)).toBe('AI_PREP_DISABLED');

    process.env.AI_PREP_ENABLED = 'true';
    expect(aiPrepEnabled()).toBe(true);
    expect(aiPrepGateFailureReason(payload.tenantId)).toBeNull();
  });

  it('requires a matching canary tenant when the allowlist is required', () => {
    const otherTenantId = '22222222-2222-4222-8222-222222222222';
    expect(aiPrepCanaryTenantIds(`${payload.tenantId}, ${otherTenantId}`)).toEqual(
      new Set([payload.tenantId, otherTenantId]),
    );
    expect(
      aiPrepTenantAllowed(payload.tenantId, {
        canaryTenantIds: new Set([payload.tenantId]),
        requireAllowlist: true,
      }),
    ).toBe(true);
    expect(
      aiPrepTenantAllowed(otherTenantId, {
        canaryTenantIds: new Set([payload.tenantId]),
        requireAllowlist: true,
      }),
    ).toBe(false);
    expect(
      aiPrepTenantAllowed(payload.tenantId, { canaryTenantIds: new Set(), requireAllowlist: true }),
    ).toBe(false);
  });

  it('blocks enqueueing and records bounded audit when ai prep is disabled', async () => {
    process.env.AI_PREP_ENABLED = 'false';
    const audit = { log: vi.fn(async () => ({ eventId: 'event', createdAt: new Date() })) };
    const client = {
      query: vi.fn(async () => ({ rows: [{ matter_id: matterId }], rowCount: 1 })),
    };
    const service = new AiPrepQueueService(audit as never);

    await expect(
      service.enqueueVersionArtifacts(
        {
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          versionId: payload.versionId,
          matterId,
        },
        client as never,
      ),
    ).resolves.toEqual([]);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_PREP_BLOCKED',
        result: 'denied',
        targetType: 'document_version',
        metadata: expect.objectContaining({
          ai_prep_status: 'blocked',
          reason_code: 'AI_PREP_DISABLED',
        }),
      }),
      client,
    );
  });

  it('blocks enqueueing outside the required canary tenant allowlist', async () => {
    process.env.AI_PREP_ENABLED = 'true';
    process.env.AI_PREP_REQUIRE_TENANT_ALLOWLIST = 'true';
    process.env.AI_PREP_CANARY_TENANT_IDS = '22222222-2222-4222-8222-222222222222';
    const audit = { log: vi.fn(async () => ({ eventId: 'event', createdAt: new Date() })) };
    const client = {
      query: vi.fn(async () => ({ rows: [{ matter_id: matterId }], rowCount: 1 })),
    };
    const service = new AiPrepQueueService(audit as never);

    await expect(
      service.enqueueVersionArtifacts(
        {
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          versionId: payload.versionId,
          matterId,
        },
        client as never,
      ),
    ).resolves.toEqual([]);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AI_PREP_BLOCKED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'AI_PREP_SCOPE_DENIED',
        }),
      }),
      client,
    );
  });

  it('marks unexpected worker exceptions as failed artifacts and releases tenant concurrency', async () => {
    process.env.AI_PREP_ENABLED = 'true';
    const processor = {
      handle: vi.fn(async () => {
        throw new Error('boom');
      }),
      markWorkerFailure: vi.fn(async () => undefined),
    };
    const service = new AiPrepQueueService({ log: vi.fn() } as never, processor as never);

    await expect(
      (
        service as unknown as {
          handleQueuedJob: (job: { data: AiPrepJobPayload }) => Promise<void>;
        }
      ).handleQueuedJob({ data: payload }),
    ).resolves.toBeUndefined();

    expect(processor.markWorkerFailure).toHaveBeenCalledWith(
      payload,
      'AI_PREP_WORKER_EXCEPTION',
    );
    expect(
      aiPrepTenantConcurrencyAllows(
        (
          service as unknown as {
            activeTenantCounts: ReadonlyMap<string, number>;
          }
        ).activeTenantCounts,
        payload.tenantId,
        1,
      ),
    ).toBe(true);
  });
});
