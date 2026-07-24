import { Injectable } from '@nestjs/common';
import type { UserRole } from '@amic-vault/shared';
import type { UserEntity } from '../user/user.entity';

export interface MfaDecision {
  outcome: 'allow' | 'bootstrap' | 'challenge' | 'deny';
  reason?: 'mfa_required' | 'mfa_enrollment_required';
}

export function isPrivilegedLocalAdminRole(role: UserRole): boolean {
  return role === 'firm_admin' || role === 'security_admin';
}

@Injectable()
export class MfaPolicy {
  evaluate(
    user: UserEntity,
    input: { hasActiveSecret: boolean; production?: boolean },
  ): MfaDecision {
    if (input.production && isPrivilegedLocalAdminRole(user.role)) {
      if (input.hasActiveSecret) return { outcome: 'challenge', reason: 'mfa_required' };
      if (user.mfaEnabled) return { outcome: 'deny', reason: 'mfa_enrollment_required' };
      return { outcome: 'bootstrap', reason: 'mfa_enrollment_required' };
    }
    if (!user.mfaEnabled) return { outcome: 'allow' };
    if (!input.hasActiveSecret) return { outcome: 'deny', reason: 'mfa_enrollment_required' };
    return { outcome: 'challenge', reason: 'mfa_required' };
  }
}
