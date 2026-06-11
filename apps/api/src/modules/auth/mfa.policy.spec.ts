import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { UserEntity } from '../user/user.entity';
import { MfaPolicy } from './mfa.policy';

function userWithMfa(enabled: boolean): UserEntity {
  const now = new Date('2026-06-11T00:00:00Z');
  return new UserEntity({
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
    email: 'alpha@test.local',
    name: 'Alpha',
    role: 'Matter Owner',
    practiceGroup: 'corporate',
    status: 'active',
    passwordHash: '$argon2id$placeholder',
    mfaEnabled: enabled,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('MfaPolicy', () => {
  it('allows mfa_enabled=false users in R0', () => {
    expect(new MfaPolicy().evaluate(userWithMfa(false))).toEqual({ allowed: true });
  });

  it('fails closed while TOTP is not implemented', () => {
    expect(new MfaPolicy().evaluate(userWithMfa(true))).toEqual({
      allowed: false,
      reason: 'mfa_not_available',
    });
  });
});
