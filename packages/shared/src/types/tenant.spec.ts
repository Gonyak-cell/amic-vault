import { describe, expect, expectTypeOf, it } from 'vitest';
import { tenantStatuses, workspaceStatuses, type TenantSummary } from './tenant';
import type { TenantSettingsDto } from '../dto/tenant-settings.dto';

describe('tenant shared contract', () => {
  it('exposes only the R0 tenant status values', () => {
    expect(tenantStatuses).toEqual(['active', 'suspended', 'disabled']);
    expect(workspaceStatuses).toEqual(['active', 'archived']);
  });

  it('keeps tenant settings DTO whitelisted', () => {
    expectTypeOf<TenantSettingsDto>().toMatchTypeOf<TenantSummary>();
    expectTypeOf<TenantSettingsDto>().not.toHaveProperty('settingsJson');
    expectTypeOf<TenantSettingsDto>().not.toHaveProperty('passwordHash');
  });
});
