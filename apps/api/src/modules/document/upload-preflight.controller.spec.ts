import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { UploadPreflightController } from './upload-preflight.controller';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

describe('UploadPreflightController', () => {
  it('creates a Matter-scoped upload preflight receipt', async () => {
    const createUploadPreflight = vi.fn(async () => ({
      matterReference: matterId,
      preflightRef: 'upf_ref',
      expiresAt: '2026-06-20T00:05:00.000Z',
      sourceMode: 'matter_app_api',
      sourceUpdatedAt: null,
      sourceRevision: 'source-rev-1',
      permissionDecisionRef: 'matter-upload-permission:decision',
      uploadEligible: true,
      blockedReason: null,
    }));
    const controller = new UploadPreflightController(
      { createUploadPreflight } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    await expect(
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, matterId, {}),
    ).resolves.toMatchObject({
      preflightRef: 'upf_ref',
      uploadEligible: true,
    });
    expect(createUploadPreflight).toHaveBeenCalledWith({
      actorUserId,
      matterId,
      tenantId,
    });
  });

  it('rejects non-empty request bodies and raw matter refs', async () => {
    const controller = new UploadPreflightController(
      { createUploadPreflight: vi.fn() } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    expect(() =>
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, matterId, {
        matterId,
      }),
    ).toThrow();
    expect(() =>
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, 'raw-ref', {}),
    ).toThrow();
  });
});
