import type { TenantId, TenantStatus } from '@amic-vault/shared';

export interface TenantEntity {
  tenantId: TenantId;
  name: string;
  slug: string;
  region: string;
  dataResidency: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}
