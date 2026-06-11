import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { TenantEntity } from './tenant.entity';
import { TenantService } from './tenant.service';
import type { TenantStore } from './tenant.store';

const activeTenant: TenantEntity = {
  tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
  name: 'Tenant Alpha',
  slug: 'tenant-alpha',
  region: 'kr',
  dataResidency: 'kr',
  status: 'active',
  createdAt: new Date('2026-06-11T00:00:00Z'),
  updatedAt: new Date('2026-06-11T00:00:00Z'),
};

function createStore(): TenantStore {
  return {
    async findTenantById(tenantId) {
      return tenantId === activeTenant.tenantId ? activeTenant : null;
    },
    async findTenantBySlug(slug) {
      return slug === activeTenant.slug ? activeTenant : null;
    },
    async listTenantsByStatus(status) {
      return !status || status === activeTenant.status ? [activeTenant] : [];
    },
    async listWorkspacesByTenant() {
      return [];
    },
    async findWorkspaceByIdForTenant() {
      return null;
    },
  };
}

describe('TenantService', () => {
  it('finds tenants by id and slug', async () => {
    const service = new TenantService(createStore());

    await expect(service.findById(activeTenant.tenantId)).resolves.toEqual(activeTenant);
    await expect(service.findBySlug(activeTenant.slug)).resolves.toEqual(activeTenant);
  });

  it('returns null for unknown tenants', async () => {
    const service = new TenantService(createStore());

    await expect(service.findById('22222222-2222-4222-8222-222222222222')).resolves.toBeNull();
  });

  it('filters by tenant status and exposes whitelisted settings', async () => {
    const service = new TenantService(createStore());

    await expect(service.listByStatus('suspended')).resolves.toEqual([]);
    expect(service.toSettingsDto(activeTenant)).toEqual({
      tenantId: activeTenant.tenantId,
      name: 'Tenant Alpha',
      slug: 'tenant-alpha',
      region: 'kr',
      dataResidency: 'kr',
      status: 'active',
    });
  });
});
