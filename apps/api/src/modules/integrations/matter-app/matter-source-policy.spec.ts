import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission, type TenantId } from '@amic-vault/shared';
import { tenantQuery } from '../../../common/db/tenant-query';
import { MatterSourcePolicyService } from './matter-source-policy';

vi.mock('../../../common/db/tenant-query', () => ({
  tenantQuery: vi.fn(),
}));

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

function sourceStatus(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'matter_app_api',
    requestedMode: 'matter_app_api',
    label: 'Matter app API',
    description: 'Runtime ready',
    sourceConfigured: true,
    runtimeReady: true,
    sourceContractReady: true,
    sourceAvailable: true,
    uploadAuthoritative: true,
    productionRuntime: false,
    projectionFallbackAllowed: false,
    stalenessMaxSeconds: 900,
    sourceUpdatedAt: null,
    sourceStale: false,
    ...overrides,
  };
}

function matterRow(overrides: Record<string, unknown> = {}) {
  return {
    matter_id: matterId,
    matter_code: 'AMIC-2026-0001',
    status: 'active',
    metadata_json: { matterAppSourceRevision: 'source-rev-1' },
    updated_at: new Date('2026-06-20T00:00:00.000Z'),
    ...overrides,
  };
}

function createService(options: {
  permission?: 'allow' | 'deny' | 'wall';
  source?: Record<string, unknown>;
} = {}) {
  const permission =
    options.permission === 'deny'
      ? denyPermission('PERMISSION_DENIED')
      : options.permission === 'wall'
        ? denyPermission('ETHICAL_WALL_BLOCKED')
        : allowPermission(['matter.upload']);
  return new MatterSourcePolicyService(
    { status: vi.fn(() => sourceStatus(options.source)) } as never,
    { canUploadToMatter: vi.fn(async () => permission) } as never,
  );
}

describe('MatterSourcePolicyService', () => {
  beforeEach(() => {
    vi.mocked(tenantQuery).mockReset();
  });

  it('fails closed before querying projection when source is unavailable', async () => {
    const service = createService({
      source: {
        mode: 'unconfigured',
        sourceContractReady: false,
        sourceAvailable: false,
        uploadAuthoritative: false,
        unavailableReason: 'runtime_not_ready',
      },
    });

    await expect(
      service.createUploadPreflight({ actorUserId, matterId, tenantId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantQuery).not.toHaveBeenCalled();
  });

  it('blocks stale source projections before permission checks', async () => {
    const service = createService({
      source: {
        mode: 'unconfigured',
        sourceContractReady: false,
        sourceAvailable: false,
        sourceStale: true,
        uploadAuthoritative: false,
        unavailableReason: 'stale_projection',
      },
    });

    await expect(
      service.assertUploadMutationAllowed({
        actorUserId,
        matterId,
        tenantId,
        purpose: 'document_upload',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantQuery).not.toHaveBeenCalled();
  });

  it('blocks closed, archived, and disposal state matters with safe denied output', async () => {
    vi.mocked(tenantQuery).mockResolvedValueOnce({
      rowCount: 1,
      rows: [matterRow({ status: 'closed' })],
    } as never);
    const service = createService();

    await expect(
      service.createUploadPreflight({ actorUserId, matterId, tenantId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves ethical wall denial as the public error code', async () => {
    vi.mocked(tenantQuery).mockResolvedValueOnce({
      rowCount: 1,
      rows: [matterRow()],
    } as never);
    const service = createService({ permission: 'wall' });

    await expect(
      service.createUploadPreflight({ actorUserId, matterId, tenantId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues a short-lived reference-only preflight receipt for eligible matters', async () => {
    vi.mocked(tenantQuery).mockResolvedValueOnce({
      rowCount: 1,
      rows: [matterRow()],
    } as never);
    const service = createService();

    const response = await service.createUploadPreflight({
      actorUserId,
      matterId,
      tenantId,
      now: new Date('2026-06-20T00:00:00.000Z'),
    });

    expect(response).toMatchObject({
      matterReference: matterId,
      sourceMode: 'matter_app_api',
      sourceRevision: 'source-rev-1',
      permissionDecisionRef: expect.stringMatching(/^matter-upload-permission:[0-9a-f]{64}$/),
      uploadEligible: true,
      blockedReason: null,
    });
    expect(response.preflightRef).toMatch(/^upf_/);
    expect(response.expiresAt).toBe('2026-06-20T00:05:00.000Z');
  });

  it('accepts only issued preflight receipts for upload mutation refs', async () => {
    vi.mocked(tenantQuery).mockResolvedValue({
      rowCount: 1,
      rows: [matterRow()],
    } as never);
    const service = createService();

    const response = await service.createUploadPreflight({
      actorUserId,
      matterId,
      tenantId,
      now: new Date('2026-06-20T00:00:00.000Z'),
    });
    const decision = await service.assertUploadMutationAllowed({
      actorUserId,
      matterId,
      tenantId,
      purpose: 'document_upload',
      uploadPreflightRef: response.preflightRef,
      now: new Date('2026-06-20T00:01:00.000Z'),
    });

    expect(decision.preflightRef).toBe(response.preflightRef);
    expect(decision.preflightExpiresAt).toBe(response.expiresAt);
  });

  it('rejects unissued and expired upload preflight refs', async () => {
    vi.mocked(tenantQuery).mockResolvedValue({
      rowCount: 1,
      rows: [matterRow()],
    } as never);
    const service = createService();

    await expect(
      service.assertUploadMutationAllowed({
        actorUserId,
        matterId,
        tenantId,
        purpose: 'document_upload',
        uploadPreflightRef: 'upf_missing',
        now: new Date('2026-06-20T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const response = await service.createUploadPreflight({
      actorUserId,
      matterId,
      tenantId,
      now: new Date('2026-06-20T00:00:00.000Z'),
    });

    await expect(
      service.assertUploadMutationAllowed({
        actorUserId,
        matterId,
        tenantId,
        purpose: 'document_upload',
        uploadPreflightRef: response.preflightRef,
        now: new Date('2026-06-20T00:05:01.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
