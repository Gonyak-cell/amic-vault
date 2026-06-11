import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { TenantEntity } from '../tenant/tenant.entity';
import type { TenantService } from '../tenant/tenant.service';
import { hashPassword } from '../user/password';
import { UserEntity } from '../user/user.entity';
import type { UserService } from '../user/user.service';
import type { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { MfaPolicy } from './mfa.policy';
import type { SessionRecord, SessionRepository } from './session.repository';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;

function tenant(): TenantEntity {
  const now = new Date('2026-06-11T00:00:00Z');
  return {
    tenantId,
    name: 'Tenant Alpha',
    slug: 'tenant-alpha',
    region: 'kr',
    dataResidency: 'kr',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

async function user(password: string, mfaEnabled = false): Promise<UserEntity> {
  const now = new Date('2026-06-11T00:00:00Z');
  return new UserEntity({
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId,
    email: 'alpha@test.local',
    name: 'Alpha',
    role: 'matter_owner',
    practiceGroup: 'corporate',
    status: 'active',
    passwordHash: await hashPassword(password),
    mfaEnabled,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function fakeTenantService(entity: TenantEntity | null): TenantService {
  return {
    async findById() {
      return entity;
    },
    async findBySlug() {
      return entity;
    },
  } as unknown as TenantService;
}

function fakeUserService(entity: UserEntity | null): UserService {
  return {
    async findByTenantAndEmail() {
      return entity;
    },
    async recordLoginSuccess() {},
  } as unknown as UserService;
}

class MemorySessionRepository {
  readonly sessions: SessionRecord[] = [];

  async createSession(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      mfaVerified: false,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.push(session);
    return session;
  }
}

class MemoryAuditService {
  readonly events: unknown[] = [];

  async log(input: unknown): Promise<void> {
    this.events.push(input);
  }

  async transaction<T>(_tenantId: string, run: (client: never) => Promise<T>): Promise<T> {
    return run(undefined as never);
  }
}

function createService(entity: UserEntity | null, tenantEntity: TenantEntity | null = tenant()) {
  const auditService = new MemoryAuditService();
  return new AuthService(
    fakeTenantService(tenantEntity),
    fakeUserService(entity),
    new MemorySessionRepository() as unknown as SessionRepository,
    new MfaPolicy(),
    auditService as unknown as AuditService,
  );
}

describe('AuthService', () => {
  it('creates an http-only-cookie-ready session for valid credentials', async () => {
    const service = createService(await user('secret-password'));

    const result = await service.login(
      { tenantId, email: 'Alpha@Test.Local', password: 'secret-password' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(result.sessionToken).toHaveLength(43);
    expect(result.session.tokenHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.user.email).toBe('alpha@test.local');
    expect(JSON.stringify(service.securityEvents())).not.toContain('secret-password');
    expect(JSON.stringify(service.securityEvents())).not.toContain(result.session.tokenHash);
  });

  it('returns the same AUTH_REQUIRED shape for invalid password, missing user, and missing tenant', async () => {
    const existingUser = await user('secret-password');
    const cases = [
      createService(existingUser),
      createService(null),
      createService(null, null),
    ];

    for (const service of cases) {
      await expect(
        service.login(
          { tenantId, email: 'alpha@test.local', password: 'wrong-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_REQUIRED' },
      });
    }
  });

  it('fails closed for mfa_enabled users before R1 TOTP exists', async () => {
    const service = createService(await user('secret-password', true));

    await expect(
      service.login(
        { tenantId, email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies external_user session issuance before R11', async () => {
    const external = await user('secret-password');
    const service = createService(new UserEntity({ ...external, role: 'external_user' }));

    await expect(
      service.login(
        { tenantId, email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
