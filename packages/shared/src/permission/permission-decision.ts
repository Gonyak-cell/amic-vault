import type { ErrorCode } from '../index';

export type PermissionEffect = 'ALLOW' | 'DENY';

export type PermissionReasonCode =
  | ErrorCode
  | 'ALLOWED'
  | 'EVAL_FAILURE'
  | 'MATTER_CLOSED'
  | 'NOT_IMPLEMENTED';

export interface PermissionDecision {
  effect: PermissionEffect;
  reasonCode: PermissionReasonCode;
  appliedRules: string[];
}

export function allowPermission(appliedRules: string[] = []): PermissionDecision {
  return { effect: 'ALLOW', reasonCode: 'ALLOWED', appliedRules };
}

export function denyPermission(
  reasonCode: Exclude<PermissionReasonCode, 'ALLOWED'> = 'PERMISSION_DENIED',
  appliedRules: string[] = [],
): PermissionDecision {
  return { effect: 'DENY', reasonCode, appliedRules };
}

