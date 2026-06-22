import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AssignAccountLedgerIdDto, TenantId } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { UserService } from './user.service';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class UserLoginIdentityService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async assignAccountLedgerId(
    tenantId: TenantId,
    actorUserId: string,
    targetUserId: string,
    input: AssignAccountLedgerIdDto,
  ) {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active' || actor.role !== 'firm_admin') {
      throw permissionDenied();
    }

    const target = await this.userService.findByTenantAndId(tenantId, targetUserId);
    if (!target) throw notFoundDenied();

    await this.auditService.transaction(tenantId, async (tx) => {
      await this.userService.assignAccountLedgerId(
        {
          tenantId,
          userId: targetUserId,
          accountLedgerId: input.accountLedgerId,
        },
        tx,
      );
      await this.auditService.log(
        {
          tenantId,
          actorId: actorUserId,
          action: 'ACCOUNT_LEDGER_ID_ASSIGNED',
          targetType: 'user',
          targetId: targetUserId,
          metadata: {
            identity_type: 'account_ledger_id',
            target_user_id: targetUserId,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId,
          actorId: actorUserId,
          targetType: 'user',
          targetId: targetUserId,
          beforeRef: 'account_ledger_id:previous',
          afterRef: 'account_ledger_id:assigned',
          reasonCode: 'account_ledger_id_assigned',
        },
        tx,
      );
    });

    return target.toSummary();
  }
}
