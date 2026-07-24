import { describe, expect, it } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { UserEntity } from '../user/user.entity';
import { MfaPolicy } from './mfa.policy';

function userWithMfa(enabled: boolean, role: UserEntity['role'] = 'matter_owner'): UserEntity {
  const now = new Date('2026-06-11T00:00:00Z');
  return new UserEntity({
    userId: '11111111-1111-4111-8111-111111111101',
    tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
    email: 'alpha@test.local',
    name: 'Alpha',
    role,
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
    expect(new MfaPolicy().evaluate(userWithMfa(false), { hasActiveSecret: false })).toEqual({
      outcome: 'allow',
    });
  });

  it('requires enrollment when MFA is enabled without an active TOTP secret', () => {
    expect(new MfaPolicy().evaluate(userWithMfa(true), { hasActiveSecret: false })).toEqual({
      outcome: 'deny',
      reason: 'mfa_enrollment_required',
    });
  });

  it('requires a challenge when MFA is enabled with an active TOTP secret', () => {
    expect(new MfaPolicy().evaluate(userWithMfa(true), { hasActiveSecret: true })).toEqual({
      outcome: 'challenge',
      reason: 'mfa_required',
    });
  });

  it('requires a production local-admin with an active TOTP secret to step up even when the flag is contradictory', () => {
    expect(
      new MfaPolicy().evaluate(userWithMfa(false, 'firm_admin'), {
        hasActiveSecret: true,
        production: true,
      }),
    ).toEqual({ outcome: 'challenge', reason: 'mfa_required' });
  });

  it('permits only the explicit bootstrap outcome for a production local-admin without an active secret', () => {
    expect(
      new MfaPolicy().evaluate(userWithMfa(false, 'security_admin'), {
        hasActiveSecret: false,
        production: true,
      }),
    ).toEqual({ outcome: 'bootstrap', reason: 'mfa_enrollment_required' });
    expect(
      new MfaPolicy().evaluate(userWithMfa(true, 'security_admin'), {
        hasActiveSecret: false,
        production: true,
      }),
    ).toEqual({ outcome: 'deny', reason: 'mfa_enrollment_required' });
  });
});
