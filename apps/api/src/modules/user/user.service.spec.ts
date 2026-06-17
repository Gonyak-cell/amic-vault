import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantId, UserRole } from '@amic-vault/shared';
import { verifyPasswordHash } from './password';
import { UserEntity } from './user.entity';
import { type CreateUserInput, type LoginCandidate, type UserStore, UserService } from './user.service';

const tenantAlpha = '11111111-1111-4111-8111-111111111111' as TenantId;
const tenantBeta = '22222222-2222-4222-8222-222222222222' as TenantId;

class MemoryUserStore implements UserStore {
  readonly users: UserEntity[] = [];

  async createUser(input: CreateUserInput & { passwordHash: string }): Promise<UserEntity> {
    const now = new Date('2026-06-11T00:00:00Z');
    const user = new UserEntity({
      userId: `${input.tenantId}:${input.email}`,
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      practiceGroup: input.practiceGroup,
      status: 'active',
      passwordHash: input.passwordHash,
      mfaEnabled: false,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
    this.users.push(user);
    return user;
  }

  async findUniqueLoginCandidateByEmail(email: string): Promise<LoginCandidate | null> {
    const matchingUsers = this.users.filter((user) => user.email === email);
    if (matchingUsers.length !== 1) return null;
    const user = matchingUsers[0];
    if (!user) return null;
    return {
      tenant: {
        tenantId: user.tenantId,
        name: 'Tenant',
        slug: 'tenant',
        region: 'kr',
        dataResidency: 'kr',
        status: 'active',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      user,
    };
  }

  async findByTenantAndEmail(tenantId: TenantId, email: string): Promise<UserEntity | null> {
    return (
      this.users.find((user) => user.tenantId === tenantId && user.email === email) ?? null
    );
  }

  async findByTenantAndId(tenantId: TenantId, userId: string): Promise<UserEntity | null> {
    return (
      this.users.find((user) => user.tenantId === tenantId && user.userId === userId) ?? null
    );
  }

  async updatePasswordHash(
    tenantId: TenantId,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    const user = await this.findByTenantAndId(tenantId, userId);
    if (user) {
      this.users.splice(this.users.indexOf(user), 1, new UserEntity({ ...user, passwordHash }));
    }
  }

  async setMfaEnabled(tenantId: TenantId, userId: string, enabled: boolean): Promise<void> {
    const user = await this.findByTenantAndId(tenantId, userId);
    if (user) {
      this.users.splice(
        this.users.indexOf(user),
        1,
        new UserEntity({ ...user, mfaEnabled: enabled }),
      );
    }
  }

  async recordLoginSuccess(): Promise<void> {}

  async updateRole(
    tenantId: TenantId,
    userId: string,
    role: UserRole,
  ): Promise<UserEntity | null> {
    const user = await this.findByTenantAndId(tenantId, userId);
    if (!user) return null;
    const updated = new UserEntity({ ...user, role });
    this.users.splice(this.users.indexOf(user), 1, updated);
    return updated;
  }

  async countActiveUsersByRole(tenantId: TenantId, role: UserRole): Promise<number> {
    return this.users.filter(
      (user) => user.tenantId === tenantId && user.role === role && user.status === 'active',
    ).length;
  }
}

function createInput(tenantId: TenantId, email = 'Lawyer@Test.Local'): CreateUserInput {
  return {
    tenantId,
    email,
    name: 'Lawyer',
    role: 'matter_owner',
    practiceGroup: 'corporate',
    password: 'correct horse battery staple',
  };
}

describe('UserService', () => {
  it('stores only argon2id password hashes and verifies the round trip', async () => {
    const store = new MemoryUserStore();
    const service = new UserService(store);

    const user = await service.createUser(createInput(tenantAlpha));

    expect(user.email).toBe('lawyer@test.local');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('correct horse battery staple');
    await expect(verifyPasswordHash(user.passwordHash, 'correct horse battery staple')).resolves.toBe(
      true,
    );
  });

  it('does not expose password_hash through JSON serialization', async () => {
    const service = new UserService(new MemoryUserStore());

    const user = await service.createUser(createInput(tenantAlpha));
    const serialized = JSON.stringify(user);

    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('password_hash');
    expect(JSON.parse(serialized)).toMatchObject({
      email: 'lawyer@test.local',
      mfaEnabled: false,
    });
  });

  it('allows the same normalized email in different tenants but rejects duplicates in one tenant', async () => {
    const store = new MemoryUserStore();
    const service = new UserService(store);

    await service.createUser(createInput(tenantAlpha, 'Shared@Test.Local'));
    await expect(service.createUser(createInput(tenantBeta, 'shared@test.local'))).resolves.toBeDefined();
    await expect(service.createUser(createInput(tenantAlpha, 'shared@test.local'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('resolves an email-only login candidate only when the normalized email is unique', async () => {
    const store = new MemoryUserStore();
    const service = new UserService(store);

    await service.createUser(createInput(tenantAlpha, 'Solo@Test.Local'));
    expect(await service.findUniqueLoginCandidateByEmail('SOLO@test.local')).toMatchObject({
      tenant: { status: 'active' },
      user: { email: 'solo@test.local' },
    });

    await service.createUser(createInput(tenantBeta, 'solo@test.local'));
    await expect(service.findUniqueLoginCandidateByEmail('solo@test.local')).resolves.toBeNull();
  });
});
