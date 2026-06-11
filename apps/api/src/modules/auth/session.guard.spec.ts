import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import type { TenantEntity } from '../tenant/tenant.entity';
import type { TenantService } from '../tenant/tenant.service';
import { AuthController } from './auth.controller';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { SessionGuard } from './session.guard';
import {
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
  type SessionRecord,
  type SessionRepository,
} from './session.repository';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const token = 'session-token';
const tokenHash = hashOpaqueToken(token);

function tenant(status: TenantEntity['status'] = 'active'): TenantEntity {
  const now = new Date('2026-06-11T00:00:00Z');
  return {
    tenantId,
    name: 'Tenant Alpha',
    slug: 'tenant-alpha',
    region: 'kr',
    dataResidency: 'kr',
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function session(): SessionRecord {
  return {
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
    userId: '11111111-1111-4111-8111-111111111101',
    tokenHash,
    mfaVerified: false,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
}

class FakeSessionRepository {
  constructor(private readonly record: SessionRecord | null) {}

  async findActiveByTokenHash(candidateHash: string): Promise<SessionRecord | null> {
    return candidateHash === tokenHash ? this.record : null;
  }
}

function fakeTenantService(entity: TenantEntity | null): TenantService {
  return {
    async findById() {
      return entity;
    },
  } as unknown as TenantService;
}

function contextFor(handler: () => void, headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers };
  return {
    getHandler: () => handler,
    getClass: () => AuthController,
    switchToHttp: () => ({
      getRequest: <T>() => request as T,
      getResponse: <T>() => undefined as T,
      getNext: <T>() => undefined as T,
    }),
  } as unknown as ExecutionContext;
}

function publicAuthRoutes(): string[] {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, AuthController) as string;
  return Object.getOwnPropertyNames(AuthController.prototype)
    .filter((method) => method !== 'constructor')
    .flatMap((method) => {
      const handler = AuthController.prototype[method as keyof AuthController];
      const isPublic = Reflect.getMetadata(IS_PUBLIC_ROUTE, handler);
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const methodCode = Reflect.getMetadata(METHOD_METADATA, handler);
      return isPublic && methodPath && methodCode !== undefined
        ? [`/v1/${controllerPath}/${methodPath}`]
        : [];
    });
}

describe('SessionGuard', () => {
  it('keeps the public route allowlist limited to login and password reset routes', () => {
    expect(publicAuthRoutes()).toEqual([
      '/v1/auth/login',
      '/v1/auth/password-reset/request',
      '/v1/auth/password-reset/confirm',
    ]);
  });

  it('rejects missing and forged session cookies with AUTH_REQUIRED', async () => {
    const guard = new SessionGuard(
      new Reflector(),
      new FakeSessionRepository(null) as unknown as SessionRepository,
      fakeTenantService(tenant()),
      new TenantContextService(),
    );

    await expect(guard.canActivate(contextFor(() => undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(contextFor(() => undefined, { cookie: `${SESSION_COOKIE_NAME}=forged` })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enters tenant context from the session and ignores client tenant headers', async () => {
    const tenantContext = new TenantContextService();
    const guard = new SessionGuard(
      new Reflector(),
      new FakeSessionRepository(session()) as unknown as SessionRepository,
      fakeTenantService(tenant()),
      tenantContext,
    );

    await expect(
      guard.canActivate(
        contextFor(() => undefined, {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          'x-tenant-id': '22222222-2222-4222-8222-222222222222',
        }),
      ),
    ).resolves.toBe(true);

    expect(tenantContext.require()).toMatchObject({
      tenantId,
      source: 'session',
    });
  });
});
