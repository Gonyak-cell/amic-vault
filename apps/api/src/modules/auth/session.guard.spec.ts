import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ExecutionContext } from '@nestjs/common';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { TenantContextService } from '../tenant/tenant-context';
import type { TenantEntity } from '../tenant/tenant.entity';
import type { TenantService } from '../tenant/tenant.service';
import type { UserEntity } from '../user/user.entity';
import type { UserService } from '../user/user.service';
import { AuthController } from './auth.controller';
import { ALLOW_UNVERIFIED_MFA_BOOTSTRAP_MUTATION } from './mfa-bootstrap.decorator';
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

function session(mfaVerified = false): SessionRecord {
  return {
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId,
    userId: '11111111-1111-4111-8111-111111111101',
    tokenHash,
    mfaVerified,
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

function fakeUserService(
  input: { mfaEnabled?: boolean; role?: UserEntity['role'] } = {},
): UserService {
  return {
    async findByTenantAndId() {
      return {
        userId: '11111111-1111-4111-8111-111111111101',
        tenantId,
        email: 'alpha@test.local',
        name: 'Alpha',
        role: input.role ?? 'matter_owner',
        practiceGroup: 'corporate',
        status: 'active',
        passwordHash: '$argon2id$placeholder',
        mfaEnabled: input.mfaEnabled ?? false,
        lastLoginAt: null,
        createdAt: new Date('2026-06-11T00:00:00Z'),
        updatedAt: new Date('2026-06-11T00:00:00Z'),
        toSummary: () => ({}),
        toJSON: () => ({}),
      } as unknown as UserEntity;
    },
  } as unknown as UserService;
}

function contextFor(
  handler: object,
  headers: Record<string, string> = {},
  method = 'GET',
): ExecutionContext {
  const request = { headers, method };
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

function bootstrapMutationRoutes(): string[] {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, AuthController) as string;
  return Object.getOwnPropertyNames(AuthController.prototype)
    .filter((method) => method !== 'constructor')
    .flatMap((method) => {
      const handler = AuthController.prototype[method as keyof AuthController];
      const allowed = Reflect.getMetadata(ALLOW_UNVERIFIED_MFA_BOOTSTRAP_MUTATION, handler);
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const methodCode = Reflect.getMetadata(METHOD_METADATA, handler);
      return allowed === true && methodPath && methodCode === RequestMethod.POST
        ? [`/v1/${controllerPath}/${methodPath}`]
        : [];
    });
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
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
      '/v1/auth/mfa/verify',
      '/v1/auth/password-reset/request',
      '/v1/auth/password-reset/confirm',
    ]);
  });

  it('keeps the unverified production-admin mutation allowlist limited to MFA enrollment, activation, and self-logout', () => {
    expect(bootstrapMutationRoutes()).toEqual([
      '/v1/auth/mfa/enroll',
      '/v1/auth/mfa/activate',
      '/v1/auth/logout',
    ]);
    const sourceRoot = join(process.cwd(), 'src');
    const annotatedSources = listSourceFiles(sourceRoot)
      .map((path) => ({
        path: relative(sourceRoot, path),
        count: (readFileSync(path, 'utf8').match(/@AllowUnverifiedMfaBootstrapMutation\(\)/g) ?? [])
          .length,
      }))
      .filter((entry) => entry.count > 0);
    expect(annotatedSources).toEqual([{ path: 'modules/auth/auth.controller.ts', count: 3 }]);
  });

  it('rejects missing and forged session cookies with AUTH_REQUIRED', async () => {
    const guard = new SessionGuard(
      new Reflector(),
      new FakeSessionRepository(null) as unknown as SessionRepository,
      fakeTenantService(tenant()),
      new TenantContextService(),
      fakeUserService(),
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
      fakeUserService(),
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

  it('rejects unverified sessions after MFA is enabled for the user', async () => {
    const guard = new SessionGuard(
      new Reflector(),
      new FakeSessionRepository(session()) as unknown as SessionRepository,
      fakeTenantService(tenant()),
      new TenantContextService(),
      fakeUserService({ mfaEnabled: true }),
    );

    await expect(
      guard.canActivate(contextFor(() => undefined, { cookie: `${SESSION_COOKIE_NAME}=${token}` })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies every unverified production local-admin mutation except the exact bootstrap allowlist', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const bootstrapGuard = new SessionGuard(
        new Reflector(),
        new FakeSessionRepository(session()) as unknown as SessionRepository,
        fakeTenantService(tenant()),
        new TenantContextService(),
        fakeUserService({ role: 'firm_admin' }),
      );
      const cookie = { cookie: `${SESSION_COOKIE_NAME}=${token}` };
      for (const handler of [
        AuthController.prototype.enrollMfa,
        AuthController.prototype.activateMfa,
        AuthController.prototype.logout,
      ]) {
        await expect(bootstrapGuard.canActivate(contextFor(handler, cookie, 'POST'))).resolves.toBe(true);
      }
      await expect(
        bootstrapGuard.canActivate(contextFor(() => undefined, cookie, 'POST')),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const verifiedGuard = new SessionGuard(
        new Reflector(),
        new FakeSessionRepository(session(true)) as unknown as SessionRepository,
        fakeTenantService(tenant()),
        new TenantContextService(),
        fakeUserService({ role: 'firm_admin' }),
      );
      await expect(verifiedGuard.canActivate(contextFor(() => undefined, cookie, 'PATCH'))).resolves.toBe(
        true,
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
