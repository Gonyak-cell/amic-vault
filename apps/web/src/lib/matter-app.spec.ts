import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatterDto } from '@amic-vault/shared';
import {
  filterMatterCodeOptions,
  isMatterAppSourceAvailable,
  isMatterAppSourceConfigured,
  isMatterUploadSourceMode,
  matterAppSourceMode,
  toMatterCodeOption,
} from './matter-app';

const matter = {
  matterId: '11111111-1111-4111-8111-111111111122',
  tenantId: '11111111-1111-4111-8111-111111111111',
  clientId: '11111111-1111-4111-8111-111111111133',
  matterCode: 'AMIC-2026-0001',
  matterName: 'Investment Advisory',
  matterType: 'advisory',
  status: 'active',
  openedAt: null,
  closedAt: null,
  leadLawyerId: null,
  practiceGroup: 'Finance',
  metadata: {},
  legalHold: false,
  createdBy: '11111111-1111-4111-8111-111111111101',
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  displayName: 'Investment Advisory',
  safeLabel: 'Investment Advisory',
  canViewSensitiveRef: false,
} satisfies MatterDto;

describe('matter app source contract helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when the source mode is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_MATTER_APP_SOURCE_MODE', '');

    expect(matterAppSourceMode()).toBe('unconfigured');
    expect(isMatterAppSourceAvailable('unconfigured')).toBe(false);
    expect(isMatterUploadSourceMode('unconfigured')).toBe(false);
  });

  it('does not enable an upload-authoritative source mode without the configured flag', () => {
    vi.stubEnv('NEXT_PUBLIC_MATTER_APP_SOURCE_MODE', 'matter_app_api');
    vi.stubEnv('NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED', '');

    expect(matterAppSourceMode()).toBe('unconfigured');
    expect(
      isMatterAppSourceConfigured('matter_app_api', { sourceConfigured: 'false' }),
    ).toBe(false);
    expect(
      isMatterAppSourceConfigured('matter_app_api', { sourceConfigured: 'true' }),
    ).toBe(true);
  });

  it('keeps the local projection fallback out of production source mode', () => {
    vi.stubEnv('NEXT_PUBLIC_MATTER_APP_SOURCE_MODE', 'vault_projection_only');
    vi.stubEnv('NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE', 'true');
    vi.stubEnv('NODE_ENV', 'production');

    expect(matterAppSourceMode()).toBe('unconfigured');
    expect(
      isMatterAppSourceConfigured('vault_projection_only', {
        nodeEnv: 'development',
        projectionFallbackAllowed: 'true',
      }),
    ).toBe(true);
    expect(
      isMatterAppSourceConfigured('vault_projection_only', {
        nodeEnv: 'production',
        projectionFallbackAllowed: 'true',
      }),
    ).toBe(false);
  });

  it('distinguishes upload-authoritative modes from the local projection fallback', () => {
    expect(isMatterAppSourceAvailable('vault_projection_only')).toBe(true);
    expect(isMatterUploadSourceMode('vault_projection_only')).toBe(false);
    expect(isMatterUploadSourceMode('matter_app_api')).toBe(true);
    expect(isMatterUploadSourceMode('matter_app_event_projection')).toBe(true);
  });

  it('filters Matter Code options without exposing internal references', () => {
    const option = toMatterCodeOption(matter, 'matter_app_event_projection');

    expect(option).toMatchObject({
      matterReference: matter.matterId,
      matterCode: 'AMIC-2026-0001',
      matterName: 'Investment Advisory',
      practiceGroup: 'Finance',
    });
    expect(filterMatterCodeOptions([option], 'finance')).toHaveLength(1);
    expect(filterMatterCodeOptions([option], 'litigation')).toHaveLength(0);
  });
});
