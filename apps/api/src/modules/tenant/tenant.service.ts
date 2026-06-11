import { Inject, Injectable } from '@nestjs/common';
import type { TenantId, TenantStatus, TenantSettingsDto } from '@amic-vault/shared';
import type { TenantEntity } from './tenant.entity';
import { TENANT_STORE, type TenantStore } from './tenant.store';

@Injectable()
export class TenantService {
  constructor(@Inject(TENANT_STORE) private readonly store: TenantStore) {}

  findById(tenantId: string): Promise<TenantEntity | null> {
    return this.store.findTenantById(tenantId);
  }

  findBySlug(slug: string): Promise<TenantEntity | null> {
    return this.store.findTenantBySlug(slug);
  }

  listByStatus(status?: TenantStatus): Promise<TenantEntity[]> {
    return this.store.listTenantsByStatus(status);
  }

  toSettingsDto(tenant: TenantEntity): TenantSettingsDto {
    return {
      tenantId: tenant.tenantId as TenantId,
      name: tenant.name,
      slug: tenant.slug,
      region: tenant.region,
      dataResidency: tenant.dataResidency,
      status: tenant.status,
    };
  }
}
