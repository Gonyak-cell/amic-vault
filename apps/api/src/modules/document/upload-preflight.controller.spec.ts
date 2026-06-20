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
      duplicateDecisionRequired: false,
      duplicateCandidates: [],
    }));
    const findSafeUploadCandidates = vi.fn();
    const controller = new UploadPreflightController(
      { createUploadPreflight } as never,
      { findSafeUploadCandidates } as never,
      { canReadDocument: vi.fn() } as never,
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
    expect(findSafeUploadCandidates).not.toHaveBeenCalled();
  });

  it('returns safe duplicate candidates when a file hash is supplied', async () => {
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
      duplicateDecisionRequired: false,
      duplicateCandidates: [],
    }));
    const findSafeUploadCandidates = vi.fn(async () => [
      {
        documentReference: '11111111-1111-4111-8111-111111111123',
        matterCode: 'AMIC-2026-0001',
        matterName: 'Investment Advisory',
        title: 'Investment memo.pdf',
        versionLabel: 'v1 current',
      },
    ]);
    const canReadDocument = vi.fn(async () => ({ effect: 'ALLOW' }));
    const controller = new UploadPreflightController(
      { createUploadPreflight } as never,
      { findSafeUploadCandidates } as never,
      { canReadDocument } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    await expect(
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, matterId, {
        sha256: 'A'.repeat(64),
      }),
    ).resolves.toMatchObject({
      duplicateDecisionRequired: true,
      duplicateCandidates: [
        expect.objectContaining({
          title: 'Investment memo.pdf',
          versionLabel: 'v1 current',
        }),
      ],
    });
    expect(findSafeUploadCandidates).toHaveBeenCalledWith({
      tenantId,
      matterId,
      sha256: 'a'.repeat(64),
    });
    expect(canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '11111111-1111-4111-8111-111111111123',
    );
  });

  it('requires a duplicate decision without exposing unreadable candidate labels', async () => {
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
      duplicateDecisionRequired: false,
      duplicateCandidates: [],
    }));
    const findSafeUploadCandidates = vi.fn(async () => [
      {
        documentReference: '11111111-1111-4111-8111-111111111124',
        matterCode: 'AMIC-2026-0001',
        matterName: 'Restricted Matter',
        title: 'Restricted memo.pdf',
        versionLabel: 'v3 current',
      },
    ]);
    const controller = new UploadPreflightController(
      { createUploadPreflight } as never,
      { findSafeUploadCandidates } as never,
      { canReadDocument: vi.fn(async () => ({ effect: 'DENY' })) } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    await expect(
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, matterId, {
        sha256: 'b'.repeat(64),
      }),
    ).resolves.toMatchObject({
      duplicateDecisionRequired: true,
      duplicateCandidates: [],
    });
  });

  it('rejects unsupported request bodies and raw matter refs', async () => {
    const controller = new UploadPreflightController(
      { createUploadPreflight: vi.fn() } as never,
      { findSafeUploadCandidates: vi.fn() } as never,
      { canReadDocument: vi.fn() } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    await expect(
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, matterId, {
        matterId,
      }),
    ).rejects.toThrow();
    await expect(
      controller.create({ headers: {}, session: { userId: actorUserId } } as never, 'raw-ref', {}),
    ).rejects.toThrow();
  });
});
