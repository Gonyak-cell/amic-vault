import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context';

type MiddlewareRequest = Parameters<TenantContextMiddleware['use']>[0];

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

function createMiddleware(): {
  context: TenantContextService;
  middleware: TenantContextMiddleware;
} {
  const context = new TenantContextService();
  return {
    context,
    middleware: new TenantContextMiddleware(context),
  };
}

describe('TenantContextMiddleware', () => {
  it('does not accept client-supplied tenant headers after session guard is introduced', async () => {
    const { context, middleware } = createMiddleware();
    const request: MiddlewareRequest = {
      originalUrl: '/v1/tenant/settings',
    };
    let called = false;

    await middleware.use(request, undefined, () => {
      called = true;
      expect(context.current()).toBeUndefined();
    });

    expect(called).toBe(true);
  });

  it('allows public paths without tenant context', async () => {
    const { context, middleware } = createMiddleware();
    const request: MiddlewareRequest = {
      originalUrl: '/v1/health/live',
    };
    let called = false;

    await middleware.use(request, undefined, () => {
      called = true;
      expect(context.current()).toBeUndefined();
    });

    expect(called).toBe(true);
  });

  it('requires session guard to enter tenant context before protected handlers run', async () => {
    const { context } = createMiddleware();

    expect(() => context.require()).toThrow('tenant context is not available');
    context.enter({
      tenantId,
      slug: 'tenant-alpha',
      status: 'active',
      source: 'session',
    });
    expect(context.require().tenantId).toBe(tenantId);
  });
});
