export type TenantId = string & { readonly __brand: 'TenantId' };

export const tenantStatuses = ['active', 'suspended', 'disabled'] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const workspaceStatuses = ['active', 'archived'] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];

export interface TenantSummary {
  tenantId: TenantId;
  name: string;
  slug: string;
  region: string;
  dataResidency: string;
  status: TenantStatus;
}
