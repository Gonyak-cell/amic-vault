import type { TenantId, WorkspaceStatus } from '@amic-vault/shared';

export interface WorkspaceEntity {
  workspaceId: string;
  tenantId: TenantId;
  name: string;
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
}
