import type { RolePermissionDecision } from '../../../packages/shared/src/permission/role-permission-matrix';
import type {
  MatrixExpectedDecision,
  MatrixMembership,
  MatrixWallState,
} from './fixtures';
import { tenantLevelActions } from './fixtures';

export interface ReferenceInput {
  role: string;
  action: string;
  matrixDecision: RolePermissionDecision;
  membership: MatrixMembership;
  wallState: MatrixWallState;
}

export interface ReferenceDecision {
  expected: MatrixExpectedDecision;
  reasonCode: string;
  auditExpected: boolean;
}

function deny(reasonCode: string): ReferenceDecision {
  return { expected: 'DENY', reasonCode, auditExpected: true };
}

function allow(): ReferenceDecision {
  return { expected: 'ALLOW', reasonCode: 'ALLOWED', auditExpected: false };
}

export function referenceEvaluate(input: ReferenceInput): ReferenceDecision {
  if (input.role === 'external_user') return deny('AUTH_REQUIRED');
  if (input.matrixDecision === 'deny') return deny('PERMISSION_DENIED');
  if (
    !tenantLevelActions.has(input.action) &&
    (input.wallState === 'excluded' || input.wallState === 'insider_nonmember')
  ) {
    return deny('ETHICAL_WALL_BLOCKED');
  }
  if (input.matrixDecision === 'allow') return allow();
  if (input.matrixDecision === 'member' && input.membership !== 'none') return allow();
  if (input.matrixDecision === 'owner' && input.membership === 'owner') return allow();
  if (
    input.matrixDecision === 'edit' &&
    (input.membership === 'owner' || input.membership === 'member_edit')
  ) {
    return allow();
  }
  return deny('PERMISSION_DENIED');
}
