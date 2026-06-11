import { Injectable } from '@nestjs/common';
import type { UserEntity } from '../user/user.entity';

export interface MfaDecision {
  allowed: boolean;
  reason?: 'mfa_not_available';
}

@Injectable()
export class MfaPolicy {
  evaluate(user: UserEntity): MfaDecision {
    if (user.mfaEnabled) {
      return { allowed: false, reason: 'mfa_not_available' };
    }
    return { allowed: true };
  }
}
