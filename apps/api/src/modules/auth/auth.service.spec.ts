import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import type { TenantEntity } from '../tenant/tenant.entity';
import type { TenantService } from '../tenant/tenant.service';
import { hashPassword } from '../user/password';
import { UserEntity } from '../user/user.entity';
import type { UserService } from '../user/user.service';
import type { AuditService } from '../audit/audit.service';
import { AuthService, type LoginResult } from './auth.service';
import { MfaPolicy } from './mfa.policy';
import type { MfaService } from './mfa.service';
import type { SessionRecord, SessionRepository } from './session.repository';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const tenantBetaId = '22222222-2222-4222-8222-222222222222' as TenantId;

function tenant(
  input: { tenantId?: TenantId; slug?: string; status?: TenantEntity['status'] } = {},
): TenantEntity {
  const now = new Date('2026-06-11T00:00:00Z');
  return {
    tenantId: input.tenantId ?? tenantId,
    name: input.slug === 'tenant-beta' ? 'Tenant Beta' : 'Tenant Alpha',
    slug: input.slug ?? 'tenant-alpha',
    region: 'kr',
    dataResidency: 'kr',
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };
}

async function user(
  password: string,
  mfaEnabled = false,
  role: UserEntity['role'] = 'matter_owner',
): Promise<UserEntity> {
  const now = new Date('2026-06-11T00:00:00Z');
  return new UserEntity({
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId,
    email: 'alpha@test.local',
    name: 'Alpha',
    role,
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

function fakeUserService(
  entity: UserEntity | null,
  loginCandidate: { tenant: TenantEntity; user: UserEntity } | null = entity
    ? { tenant: tenant(), user: entity }
    : null,
  accountLedgerCandidate: { tenant: TenantEntity; user: UserEntity } | null = loginCandidate,
): UserService {
  return {
    async findUniqueLoginCandidateByEmail() {
      return loginCandidate;
    },
    async findLoginCandidateByAccountLedgerId() {
      return accountLedgerCandidate;
    },
    async findByTenantAndEmail() {
      return entity;
    },
    async findByTenantAndId() {
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
    mfaVerified?: boolean;
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      mfaVerified: input.mfaVerified ?? false,
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

function sessionFor(entity: UserEntity): SessionRecord {
  return {
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: entity.tenantId,
    userId: entity.userId,
    tokenHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mfaVerified: false,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
}

function fakeMfaService(input: { hasActiveSecret?: boolean } = {}): MfaService {
  return {
    async hasActiveSecret() {
      return input.hasActiveSecret ?? false;
    },
    async startChallenge() {
      return {
        mfaRequired: true,
        mfaEnabled: true,
        mfaChallengeId: `${tenantId}.challenge-token`,
      };
    },
  } as unknown as MfaService;
}

function expectLoginComplete(
  result: LoginResult,
): asserts result is Extract<LoginResult, { mfaRequired?: false }> {
  expect(result.mfaRequired).not.toBe(true);
}

function createService(
  entity: UserEntity | null,
  tenantEntity: TenantEntity | null = tenant(),
  mfaService: MfaService = fakeMfaService(),
) {
  const auditService = new MemoryAuditService();
  return new AuthService(
    fakeTenantService(tenantEntity),
    fakeUserService(entity),
    new MemorySessionRepository() as unknown as SessionRepository,
    new MfaPolicy(),
    mfaService,
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
    expectLoginComplete(result);

    expect(result.sessionToken).toHaveLength(43);
    expect(result.session.tokenHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.user.email).toBe('alpha@test.local');
    expect(JSON.stringify(service.securityEvents())).not.toContain('secret-password');
    expect(JSON.stringify(service.securityEvents())).not.toContain(result.session.tokenHash);
  });

  it('creates a session with email and password only when the email maps to one active tenant', async () => {
    const service = createService(await user('secret-password'));

    const result = await service.login(
      { email: 'Alpha@Test.Local', password: 'secret-password' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    expectLoginComplete(result);

    expect(result.user.email).toBe('alpha@test.local');
    expect(result.session.tenantId).toBe(tenantId);
  });

  it('creates a session with a global account ledger id and password', async () => {
    const existingUser = await user('secret-password');
    const service = new AuthService(
      fakeTenantService(null),
      fakeUserService(existingUser, null, { tenant: tenant(), user: existingUser }),
      new MemorySessionRepository() as unknown as SessionRepository,
      new MfaPolicy(),
      fakeMfaService(),
      new MemoryAuditService() as unknown as AuditService,
    );

    const result = await service.login(
      { accountLedgerId: 'ACCT-ALPHA-001', password: 'secret-password' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' },
    );
    expectLoginComplete(result);

    expect(result.user.email).toBe('alpha@test.local');
    expect(result.session.tenantId).toBe(tenantId);
  });

  it('fails closed when an account ledger id candidate does not match the tenant hint', async () => {
    const existingUser = await user('secret-password');
    const service = new AuthService(
      fakeTenantService(tenant({ tenantId: tenantBetaId, slug: 'tenant-beta' })),
      fakeUserService(existingUser, null, { tenant: tenant(), user: existingUser }),
      new MemorySessionRepository() as unknown as SessionRepository,
      new MfaPolicy(),
      fakeMfaService(),
      new MemoryAuditService() as unknown as AuditService,
    );

    await expect(
      service.login(
        { tenantId: tenantBetaId, accountLedgerId: 'acct-alpha-001', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED' },
    });
  });

  it('returns the current user profile from an active session', async () => {
    const existingUser = await user('secret-password');
    const service = createService(existingUser);

    await expect(service.currentUser(sessionFor(existingUser))).resolves.toMatchObject({
      user: {
        email: 'alpha@test.local',
        name: 'Alpha',
      },
    });
  });

  it('fails closed when the current user session is missing or stale', async () => {
    const service = createService(null);

    await expect(service.currentUser(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.currentUser({
        sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenantId,
        userId: '11111111-1111-4111-8111-111111111101',
        tokenHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        mfaVerified: false,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed for email-only login when no unique tenant candidate exists', async () => {
    const service = new AuthService(
      fakeTenantService(null),
      fakeUserService(null, null),
      new MemorySessionRepository() as unknown as SessionRepository,
      new MfaPolicy(),
      fakeMfaService(),
      new MemoryAuditService() as unknown as AuditService,
    );

    await expect(
      service.login(
        { email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED' },
    });
  });

  it('returns the same AUTH_REQUIRED shape for invalid password, missing user, and missing tenant', async () => {
    const existingUser = await user('secret-password');
    const cases = [createService(existingUser), createService(null), createService(null, null)];

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

  it('fails closed for mfa_enabled users without an active TOTP secret', async () => {
    const service = createService(await user('secret-password', true));

    await expect(
      service.login(
        { tenantId, email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED', reason: 'mfa_enrollment_required' },
    });
  });

  it('returns an MFA challenge instead of a session for mfa_enabled users with TOTP', async () => {
    const service = createService(
      await user('secret-password', true),
      tenant(),
      fakeMfaService({ hasActiveSecret: true }),
    );

    await expect(
      service.login(
        { tenantId, email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      ),
    ).resolves.toEqual({
      mfaRequired: true,
      mfaEnabled: true,
      mfaChallengeId: `${tenantId}.challenge-token`,
    });
  });

  it('issues an explicitly unverified MFA bootstrap session only for a production local admin without TOTP', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const service = createService(await user('secret-password', false, 'firm_admin'));

      const result = await service.login(
        { tenantId, email: 'alpha@test.local', password: 'secret-password' },
        { ipAddress: null, userAgent: null },
      );
      expectLoginComplete(result);

      expect(result.mfaEnrollmentRequired).toBe(true);
      expect(result.session.mfaVerified).toBe(false);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('never issues a production local-admin session before a TOTP challenge when an active secret exists', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const service = createService(
        await user('secret-password', false, 'security_admin'),
        tenant(),
        fakeMfaService({ hasActiveSecret: true }),
      );

      await expect(
        service.login(
          { tenantId, email: 'alpha@test.local', password: 'secret-password' },
          { ipAddress: null, userAgent: null },
        ),
      ).resolves.toEqual({
        mfaRequired: true,
        mfaEnabled: true,
        mfaChallengeId: `${tenantId}.challenge-token`,
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
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
