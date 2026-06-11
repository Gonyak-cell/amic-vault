import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context';
import { TenantService } from './tenant.service';
import type { TenantStore } from './tenant.store';

type MiddlewareRequest = Parameters<TenantContextMiddleware['use']>[0];

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const inactiveTenantId = '33333333-3333-4333-8333-333333333333' as TenantId;

const store: TenantStore = {
  async findTenantById(requestTenantId) {
    if (requestTenantId === tenantId) {
      return {
        tenantId,
        name: 'Tenant Alpha',
        slug: 'tenant-alpha',
        region: 'kr',
        dataResidency: 'kr',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    if (requestTenantId === inactiveTenantId) {
      return {
        tenantId: inactiveTenantId,
        name: 'Inactive Tenant',
        slug: 'tenant-inactive',
        region: 'kr',
        dataResidency: 'kr',
        status: 'suspended',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return null;
  },
  async findTenantBySlug() {
    return null;
  },
  async listTenantsByStatus() {
    return [];
  },
  async listWorkspacesByTenant() {
    return [];
  },
  async findWorkspaceByIdForTenant() {
    return null;
  },
};

function createMiddleware(): {
  context: TenantContextService;
  middleware: TenantContextMiddleware;
} {
  const context = new TenantContextService();
  return {
    context,
    middleware: new TenantContextMiddleware(context, new TenantService(store)),
  };
}

describe('TenantContextMiddleware', () => {
  it('propagates active tenant context from the R0 pre-auth header', async () => {
    const { context, middleware } = createMiddleware();
    const request: MiddlewareRequest = {
      headers: { 'x-tenant-id': tenantId },
      originalUrl: '/v1/tenant/settings',
    };
    let observedTenantId: TenantId | undefined;

    await middleware.use(request, undefined, () => {
      observedTenantId = context.current()?.tenantId;
    });

    expect(observedTenantId).toBe(tenantId);
  });

  it('allows public paths without tenant context', async () => {
    const { context, middleware } = createMiddleware();
    const request: MiddlewareRequest = {
      headers: {},
      originalUrl: '/v1/health/live',
    };
    let called = false;

    await middleware.use(request, undefined, () => {
      called = true;
      expect(context.current()).toBeUndefined();
    });

    expect(called).toBe(true);
  });

  it('fails closed when tenant context is missing or inactive', async () => {
    const { middleware } = createMiddleware();

    await expect(
      middleware.use({ headers: {}, originalUrl: '/v1/tenant/settings' }, undefined, () => {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      middleware.use(
        { headers: { 'x-tenant-id': inactiveTenantId }, originalUrl: '/v1/tenant/settings' },
        undefined,
        () => {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
