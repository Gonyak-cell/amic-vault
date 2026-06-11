import type { TenantId, TenantStatus } from '../types/tenant';

export interface TenantSettingsDto {
  tenantId: TenantId;
  name: string;
  slug: string;
  region: string;
  dataResidency: string;
  status: TenantStatus;
}
