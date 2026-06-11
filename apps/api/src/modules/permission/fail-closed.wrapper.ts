import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PermissionDecision, PermissionReasonCode, TenantId } from '@amic-vault/shared';
import { denyPermission } from '@amic-vault/shared';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';

export interface PermissionAuditTarget {
  tenantId: TenantId;
  actorId: string | null;
  targetType: string;
  targetId?: string | null;
  matterId?: string | null;
}

export type PermissionEvaluator = () =>
  | PermissionDecision
  | undefined
  | Promise<PermissionDecision | undefined>;

const defaultTimeoutMs = Number(process.env.PERMISSION_EVAL_TIMEOUT_MS ?? '2000');

function normalizeDeniedReason(reasonCode: PermissionReasonCode): PermissionReasonCode {
  if (reasonCode === 'ALLOWED') return 'PERMISSION_DENIED';
  return reasonCode;
}

@Injectable()
export class FailClosedPermissionWrapper {
  private readonly logger = new Logger(FailClosedPermissionWrapper.name);

  constructor(
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
  ) {}

  async evaluate(
    target: PermissionAuditTarget,
    evaluator: PermissionEvaluator,
    timeoutMs = defaultTimeoutMs,
  ): Promise<PermissionDecision> {
    let decision: PermissionDecision | undefined;
    try {
      decision = await this.withTimeout(evaluator, timeoutMs);
    } catch {
      this.logger.warn({ code: 'PERM_EVAL_ERROR', targetType: target.targetType });
      decision = denyPermission('EVAL_FAILURE', ['fail_closed:error']);
    }

    if (decision?.effect !== 'ALLOW' && decision?.effect !== 'DENY') {
      decision = denyPermission('EVAL_FAILURE', ['fail_closed:undefined']);
    }

    if (decision.effect === 'DENY') {
      await this.recordDenied(target, normalizeDeniedReason(decision.reasonCode));
    }

    return decision;
  }

  private async withTimeout(evaluator: PermissionEvaluator, timeoutMs: number) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(evaluator),
        new Promise<undefined>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('permission evaluation timeout')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private recordDenied(target: PermissionAuditTarget, reasonCode: PermissionReasonCode) {
    const auditReason =
      reasonCode === 'ETHICAL_WALL_BLOCKED' ||
      reasonCode === 'TENANT_ISOLATION_VIOLATION' ||
      reasonCode === 'EVAL_FAILURE'
        ? reasonCode
        : 'PERMISSION_DENIED';
    return this.permissionEvents.recordAccessDenied({
      tenantId: target.tenantId,
      actorId: target.actorId,
      targetType: target.targetType,
      targetId: target.targetId ?? null,
      matterId: target.matterId ?? null,
      reasonCode: auditReason,
    });
  }
}
