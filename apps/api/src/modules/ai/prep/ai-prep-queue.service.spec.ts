import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiPrepQueueService,
  aiPrepCanaryTenantIds,
  aiPrepEnabled,
  aiPrepGateFailureReason,
  aiPrepQueueSendOptions,
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
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: 'ai.prep.dead',
    });
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
});
