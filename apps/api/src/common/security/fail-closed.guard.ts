import { ForbiddenException, Injectable } from '@nestjs/common';

export interface PermissionDecision {
  effect: 'ALLOW' | 'DENY';
}

export type PermissionEvaluator = () => PermissionDecision | undefined | Promise<PermissionDecision | undefined>;

@Injectable()
export class FailClosedGuard {
  async assertAllowed(evaluator: PermissionEvaluator): Promise<void> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await evaluator();
    } catch {
      decision = undefined;
    }

    if (decision?.effect !== 'ALLOW') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
  }
}
