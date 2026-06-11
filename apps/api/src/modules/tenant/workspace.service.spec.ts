import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { WorkspaceService } from './workspace.service';
import type { TenantStore } from './tenant.store';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const workspace = {
  workspaceId: '11111111-1111-4111-8111-1111111111aa',
  tenantId,
  name: 'Alpha Default',
  status: 'active' as const,
  createdAt: new Date('2026-06-11T00:00:00Z'),
  updatedAt: new Date('2026-06-11T00:00:00Z'),
};

const store: TenantStore = {
  async findTenantById() {
    return null;
  },
  async findTenantBySlug() {
    return null;
  },
  async listTenantsByStatus() {
    return [];
  },
  async listWorkspacesByTenant(requestTenantId) {
    return requestTenantId === tenantId ? [workspace] : [];
  },
  async findWorkspaceByIdForTenant(requestTenantId, workspaceId) {
    return requestTenantId === tenantId && workspaceId === workspace.workspaceId ? workspace : null;
  },
};

describe('WorkspaceService', () => {
  it('returns only workspaces scoped to the tenant', async () => {
    const service = new WorkspaceService(store);

    await expect(service.listForTenant(tenantId)).resolves.toEqual([workspace]);
    await expect(service.findByIdForTenant(tenantId, workspace.workspaceId)).resolves.toEqual(
      workspace,
    );
  });

  it('returns null when a workspace is outside the tenant scope', async () => {
    const service = new WorkspaceService(store);

    await expect(service.findByIdForTenant(tenantId, '22222222-2222-4222-8222-2222222222bb'))
      .resolves.toBeNull();
  });
});
