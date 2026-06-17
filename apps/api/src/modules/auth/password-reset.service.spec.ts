import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId, UserStatus } from '@amic-vault/shared';
import type { AuditLogInput, AuditService, QueryClient } from '../audit/audit.service';
import type { TenantEntity } from '../tenant/tenant.entity';
import type { TenantService } from '../tenant/tenant.service';
import { hashPassword, verifyPasswordHash } from '../user/password';
import { UserEntity } from '../user/user.entity';
import type { UserService } from '../user/user.service';
import { MailerStub } from './mailer.stub';
import {
  type CompletedPasswordReset,
  type ConsumedPasswordResetToken,
  type PasswordResetStore,
  PasswordResetService,
} from './password-reset.service';
import { hashOpaqueToken, type SessionRepository } from './session.repository';

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

async function user(status: UserStatus = 'active'): Promise<UserEntity> {
  const now = new Date('2026-06-11T00:00:00Z');
  return new UserEntity({
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId,
    email: 'alpha@test.local',
    name: 'Alpha',
    role: 'matter_owner',
    practiceGroup: 'corporate',
    status,
    passwordHash: await hashPassword('old-password'),
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

interface StoredResetToken {
  tenantId: TenantId;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

class MemoryPasswordResetStore implements PasswordResetStore {
  readonly tokens: StoredResetToken[] = [];
  passwordHash: string | undefined;
  statusBefore: UserStatus = 'active';
  statusAfter: UserStatus | undefined;

  async revokeOpenTokensForUser(tenantIdInput: TenantId, userId: string): Promise<void> {
    for (const token of this.tokens) {
      if (token.tenantId === tenantIdInput && token.userId === userId && !token.usedAt) {
        token.usedAt = new Date();
      }
    }
  }

  async createToken(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.tokens.push({ ...input, usedAt: null });
  }

  async consumeTokenHash(tokenHash: string): Promise<ConsumedPasswordResetToken | null> {
    const token = this.tokens.find(
      (candidate) =>
        candidate.tokenHash === tokenHash && !candidate.usedAt && candidate.expiresAt > new Date(),
    );
    if (!token) return null;
    token.usedAt = new Date();
    return { tenantId: token.tenantId, userId: token.userId };
  }

  async updateUserPasswordHashAndActivate(
    _tenantId: TenantId,
    _userId: string,
    passwordHash: string,
  ): Promise<CompletedPasswordReset | null> {
    if (this.statusBefore === 'locked') return null;
    this.passwordHash = passwordHash;
    const result = {
      statusBefore: this.statusBefore,
      statusAfter: 'active' as const,
    };
    this.statusAfter = result.statusAfter;
    return result;
  }
}

function fakeTenantService(): TenantService {
  return {
    async findById() {
      return tenant();
    },
  } as unknown as TenantService;
}

function fakeUserService(entity: UserEntity | null): UserService {
  return {
    async findByTenantAndEmail() {
      return entity;
    },
  } as unknown as UserService;
}

function fakeSessions(revoked: string[]): SessionRepository {
  return {
    async revokeAllForUser(_tenantId: TenantId, userId: string) {
      revoked.push(userId);
    },
  } as unknown as SessionRepository;
}

function fakeAuditService(logs: AuditLogInput[] = []): AuditService {
  const client = {
    async query() {
      return { rows: [], rowCount: 0 };
    },
  } satisfies QueryClient;
  return {
    async transaction(_tenantId: string, run: (tx: QueryClient) => Promise<unknown>) {
      return run(client);
    },
    async log(input: AuditLogInput) {
      logs.push(input);
      return { eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: new Date() };
    },
  } as unknown as AuditService;
}

describe('PasswordResetService', () => {
  it('accepts nonexistent accounts without sending reset material', async () => {
    const mailer = new MailerStub();
    const service = new PasswordResetService(
      fakeTenantService(),
      fakeUserService(null),
      fakeSessions([]),
      mailer,
      fakeAuditService(),
      new MemoryPasswordResetStore(),
    );

    await expect(
      service.requestReset({ tenantId, email: 'missing@test.local' }),
    ).resolves.toEqual({ accepted: true });
    expect(mailer.sentMessages()).toHaveLength(0);
  });

  it('stores only a token hash and rejects token reuse', async () => {
    const mailer = new MailerStub();
    const store = new MemoryPasswordResetStore();
    const revokedUsers: string[] = [];
    const service = new PasswordResetService(
      fakeTenantService(),
      fakeUserService(await user()),
      fakeSessions(revokedUsers),
      mailer,
      fakeAuditService(),
      store,
    );

    await service.requestReset({ tenantId, email: 'Alpha@Test.Local' });
    const message = mailer.latestForEmail('alpha@test.local');

    expect(message).toBeDefined();
    expect(store.tokens).toHaveLength(1);
    expect(store.tokens[0]?.tokenHash).toBe(hashOpaqueToken(message?.token ?? ''));
    expect(JSON.stringify(store.tokens)).not.toContain(message?.token ?? '');

    await expect(
      service.confirmReset({ token: message?.token ?? '', password: 'new-password' }),
    ).resolves.toEqual({ accepted: true });
    expect(store.passwordHash).toBeDefined();
    await expect(verifyPasswordHash(store.passwordHash ?? '', 'new-password')).resolves.toBe(true);
    expect(revokedUsers).toEqual(['11111111-1111-4111-8111-111111111101']);

    await expect(
      service.confirmReset({ token: message?.token ?? '', password: 'newer-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows inactive users to activate through password reset with audit', async () => {
    const mailer = new MailerStub();
    const store = new MemoryPasswordResetStore();
    store.statusBefore = 'inactive';
    const revokedUsers: string[] = [];
    const auditLogs: AuditLogInput[] = [];
    const service = new PasswordResetService(
      fakeTenantService(),
      fakeUserService(await user('inactive')),
      fakeSessions(revokedUsers),
      mailer,
      fakeAuditService(auditLogs),
      store,
    );

    await service.requestReset({ tenantId, email: 'alpha@test.local' });
    const message = mailer.latestForEmail('alpha@test.local');

    expect(message).toBeDefined();
    await expect(
      service.confirmReset({ token: message?.token ?? '', password: 'new-password' }),
    ).resolves.toEqual({ accepted: true });
    expect(store.statusAfter).toBe('active');
    expect(revokedUsers).toEqual(['11111111-1111-4111-8111-111111111101']);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: 'PERMISSION_CHANGED',
        targetType: 'user',
        targetId: '11111111-1111-4111-8111-111111111101',
        metadata: {
          reason_code: 'password_reset_activation',
          status_before: 'inactive',
          status_after: 'active',
        },
      }),
    );
  });

  it('does not issue reset material for locked users', async () => {
    const mailer = new MailerStub();
    const service = new PasswordResetService(
      fakeTenantService(),
      fakeUserService(await user('locked')),
      fakeSessions([]),
      mailer,
      fakeAuditService(),
      new MemoryPasswordResetStore(),
    );

    await expect(
      service.requestReset({ tenantId, email: 'alpha@test.local' }),
    ).resolves.toEqual({ accepted: true });
    expect(mailer.sentMessages()).toHaveLength(0);
  });
});
