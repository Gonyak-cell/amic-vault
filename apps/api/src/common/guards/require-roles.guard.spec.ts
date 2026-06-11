import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { REQUIRED_ROLES_KEY } from '../decorators/require-roles.decorator';
import { PgRoleLookup, RequireRolesGuard } from './require-roles.guard';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

function context(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        session: {
          tenantId,
          userId: '11111111-1111-4111-8111-111111111101',
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

function lookup(role: string | null): PgRoleLookup {
  return {
    async findActiveRole() {
      return role;
    },
  } as unknown as PgRoleLookup;
}

describe('RequireRolesGuard', () => {
  it('allows users with required roles', async () => {
    const reflector = new Reflector();
    const handler = () => {};
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ['firm_admin'], handler);
    const guard = new RequireRolesGuard(reflector, lookup('firm_admin'));

    await expect(guard.canActivate(context(handler))).resolves.toBe(true);
  });

  it('fails closed for missing or unknown roles', async () => {
    const reflector = new Reflector();
    const handler = () => {};
    Reflect.defineMetadata(REQUIRED_ROLES_KEY, ['firm_admin'], handler);

    await expect(
      new RequireRolesGuard(reflector, lookup('matter_owner')).canActivate(context(handler)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new RequireRolesGuard(reflector, lookup('Matter Owner')).canActivate(context(handler)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      new RequireRolesGuard(reflector, lookup(null)).canActivate(context(handler)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
