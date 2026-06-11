import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { WorkspaceEntity } from './workspace.entity';
import { TENANT_STORE, type TenantStore } from './tenant.store';

@Injectable()
export class WorkspaceService {
  constructor(@Inject(TENANT_STORE) private readonly store: TenantStore) {}

  listForTenant(tenantId: TenantId): Promise<WorkspaceEntity[]> {
    return this.store.listWorkspacesByTenant(tenantId);
  }

  findByIdForTenant(tenantId: TenantId, workspaceId: string): Promise<WorkspaceEntity | null> {
    return this.store.findWorkspaceByIdForTenant(tenantId, workspaceId);
  }
}
