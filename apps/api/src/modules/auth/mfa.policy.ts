import { Injectable } from '@nestjs/common';
import type { UserEntity } from '../user/user.entity';

export interface MfaDecision {
  outcome: 'allow' | 'challenge' | 'deny';
  reason?: 'mfa_required' | 'mfa_enrollment_required';
}

@Injectable()
export class MfaPolicy {
  evaluate(user: UserEntity, input: { hasActiveSecret: boolean }): MfaDecision {
    if (!user.mfaEnabled) return { outcome: 'allow' };
    if (!input.hasActiveSecret) return { outcome: 'deny', reason: 'mfa_enrollment_required' };
    return { outcome: 'challenge', reason: 'mfa_required' };
  }
}
