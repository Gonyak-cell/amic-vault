import 'reflect-metadata';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { FailClosedGuard } from '../../apps/api/src/common/security/fail-closed.guard';
import { TenantContextService } from '../../apps/api/src/modules/tenant/tenant-context';
import type { TenantEntity } from '../../apps/api/src/modules/tenant/tenant.entity';
import type { TenantService } from '../../apps/api/src/modules/tenant/tenant.service';
import {
  SESSION_COOKIE_NAME,
  type SessionRepository,
} from '../../apps/api/src/modules/auth/session.repository';
import { SessionGuard } from '../../apps/api/src/modules/auth/session.guard';

describe('fail-closed guard integration contract', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
  const token = 'gate-fail-closed-session-token';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('FC-01 turns evaluator errors into PERMISSION_DENIED instead of fail-open', async () => {
    const guard = new FailClosedGuard();

    await expect(
      guard.assertAllowed(() => {
        throw new Error('forced permission backend failure');
      }),
    ).rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
  });

  it('FC-02 and FC-05 block missing tenant/session context without exposing internals', async () => {
    const response = await fetch(`${baseUrl}/v1/tenant/settings`);
    const body = await response.text();

    expect(response.status, body).toBe(401);
    expect(JSON.parse(body)).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(body).not.toMatch(/stack|tenant context|database|password|token|session/i);
  });

  it('FC-03 blocks session repository failures instead of continuing without context', async () => {
    const guard = new SessionGuard(
      new Reflector(),
      throwingSessionRepository() as unknown as SessionRepository,
      tenantService(activeTenant(tenantId)),
      new TenantContextService(),
    );

    await expect(guard.canActivate(contextFor({ cookie: `${SESSION_COOKIE_NAME}=${token}` })))
      .rejects.toMatchObject({ response: { code: 'AUTH_REQUIRED' }, status: 401 });
  });

  it('FC-04 denies undefined or unparseable permission decisions', async () => {
    const guard = new FailClosedGuard();

    await expect(guard.assertAllowed(() => undefined))
      .rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(guard.assertAllowed(() => ({ effect: 'MAYBE' }) as never))
      .rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
  });

  function contextFor(headers: Record<string, string>): ExecutionContext {
    const request = { headers };
    return {
      getHandler: () => contextFor,
      getClass: () => SessionGuard,
      switchToHttp: () => ({
        getRequest: <T>() => request as T,
        getResponse: <T>() => undefined as T,
        getNext: <T>() => undefined as T,
      }),
    } as unknown as ExecutionContext;
  }

  function throwingSessionRepository(): Pick<SessionRepository, 'findActiveByTokenHash'> {
    return {
      async findActiveByTokenHash() {
        throw new Error('session database unavailable');
      },
    };
  }

  function tenantService(entity: TenantEntity): TenantService {
    return {
      async findById() {
        return entity;
      },
    } as unknown as TenantService;
  }

  function activeTenant(id: TenantId): TenantEntity {
    const now = new Date('2026-06-11T00:00:00Z');
    return {
      tenantId: id,
      name: 'Tenant Alpha',
      slug: 'tenant-alpha',
      region: 'kr',
      dataResidency: 'kr',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

});
