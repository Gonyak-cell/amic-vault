import { Inject, Injectable } from '@nestjs/common';
import type { AuditMetadata, ErrorCode } from '@amic-vault/shared';
import { AuditService, type QueryClient } from './audit.service';

export interface PermissionChangedInput {
  tenantId: string;
  actorId: string;
  targetType: string;
  targetId: string;
  matterId?: string | null;
  beforeRef: string;
  afterRef: string;
  reasonCode: string;
  memberUserId?: string;
  wallId?: string;
}

export interface AccessDeniedInput {
  tenantId: string;
  actorId: string | null;
  targetType: string;
  targetId?: string | null;
  matterId?: string | null;
  reasonCode:
    | Extract<
        ErrorCode,
        'PERMISSION_DENIED' | 'ETHICAL_WALL_BLOCKED' | 'TENANT_ISOLATION_VIOLATION'
      >
    | 'EVAL_FAILURE';
}

@Injectable()
export class PermissionEventRecorder {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  recordPermissionChanged(input: PermissionChangedInput, client: QueryClient) {
    const metadata: AuditMetadata = {
      before_ref: input.beforeRef,
      after_ref: input.afterRef,
      reason_code: input.reasonCode,
    };
    if (input.memberUserId) metadata.member_user_id = input.memberUserId;
    if (input.wallId) metadata.wall_id = input.wallId;
    if (input.matterId) metadata.matter_id = input.matterId;

    return this.auditService.log(
      {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'PERMISSION_CHANGED',
        targetType: input.targetType,
        targetId: input.targetId,
        matterId: input.matterId ?? null,
        metadata,
      },
      client,
    );
  }

  async recordAccessDenied(input: AccessDeniedInput): Promise<void> {
    const metadata: AuditMetadata = { reason_code: input.reasonCode };
    if (input.matterId) metadata.matter_id = input.matterId;
    try {
      await this.auditService.log({
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'ACCESS_DENIED',
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        matterId: input.matterId ?? null,
        result: 'denied',
        metadata,
      });
    } catch {
      // Denial must still be returned if audit storage is temporarily unavailable.
    }
  }
}
