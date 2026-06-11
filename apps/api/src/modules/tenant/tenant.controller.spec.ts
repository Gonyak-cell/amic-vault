import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from './tenant-context';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { WorkspaceService } from './workspace.service';
import type { TenantStore } from './tenant.store';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const workspaceId = '11111111-1111-4111-8111-1111111111aa';

const store: TenantStore = {
  async findTenantById(requestTenantId) {
    return requestTenantId === tenantId
      ? {
          tenantId,
          name: 'Tenant Alpha',
          slug: 'tenant-alpha',
          region: 'kr',
          dataResidency: 'kr',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null;
  },
  async findTenantBySlug() {
    return null;
  },
  async listTenantsByStatus() {
    return [];
  },
  async listWorkspacesByTenant(requestTenantId) {
    return requestTenantId === tenantId
      ? [
          {
            workspaceId,
            tenantId,
            name: 'Alpha Default',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : [];
  },
  async findWorkspaceByIdForTenant(requestTenantId, requestWorkspaceId) {
    return requestTenantId === tenantId && requestWorkspaceId === workspaceId
      ? {
          workspaceId,
          tenantId,
          name: 'Alpha Default',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null;
  },
};

function createController(): {
  context: TenantContextService;
  controller: TenantController;
} {
  const context = new TenantContextService();
  const tenantService = new TenantService(store);
  const workspaceService = new WorkspaceService(store);
  return {
    context,
    controller: new TenantController(context, tenantService, workspaceService),
  };
}

describe('TenantController', () => {
  it('returns whitelisted tenant settings for the current tenant', async () => {
    const { context, controller } = createController();

    await context.run(
      { tenantId, slug: 'tenant-alpha', status: 'active', source: 'pre-auth-header' },
      async () => {
        await expect(controller.getSettings()).resolves.toEqual({
          tenantId,
          name: 'Tenant Alpha',
          slug: 'tenant-alpha',
          region: 'kr',
          dataResidency: 'kr',
          status: 'active',
        });
      },
    );
  });

  it('returns workspace only inside the current tenant scope', async () => {
    const { context, controller } = createController();

    await context.run(
      { tenantId, slug: 'tenant-alpha', status: 'active', source: 'pre-auth-header' },
      async () => {
        await expect(controller.getWorkspace(workspaceId)).resolves.toMatchObject({
          workspaceId,
          tenantId,
          name: 'Alpha Default',
        });
        await expect(controller.getWorkspace('22222222-2222-4222-8222-2222222222bb'))
          .rejects.toBeInstanceOf(NotFoundException);
      },
    );
  });
});
