import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssignUserRoleDto, TenantId } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { UserService } from './user.service';

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class UserRoleService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async assignRole(
    tenantId: TenantId,
    actorUserId: string,
    targetUserId: string,
    input: AssignUserRoleDto,
  ) {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active' || actor.role !== 'firm_admin') {
      throw permissionDenied();
    }
    if (input.role === 'external_user') throw permissionDenied();

    const target = await this.userService.findByTenantAndId(tenantId, targetUserId);
    if (!target) throw notFoundDenied();
    if (target.role === input.role) return target.toSummary();

    if (
      actorUserId === targetUserId &&
      target.role === 'firm_admin' &&
      input.role !== 'firm_admin'
    ) {
      const adminCount = await this.userService.countActiveUsersByRole(tenantId, 'firm_admin');
      if (adminCount <= 1) throw validationFailed();
    }

    const updated = await this.auditService.transaction(tenantId, async (tx) => {
      const changed = await this.userService.updateRole(tenantId, targetUserId, input.role, tx);
      if (!changed) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId,
          actorId: actorUserId,
          action: 'ROLE_ASSIGNED',
          targetType: 'user',
          targetId: targetUserId,
          metadata: {
            role_after: input.role,
          },
        },
        tx,
      );
      await this.auditService.log(
        {
          tenantId,
          actorId: actorUserId,
          action: 'ROLE_CHANGED',
          targetType: 'user',
          targetId: targetUserId,
          metadata: {
            role_before: target.role,
            role_after: input.role,
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
          beforeRef: `role:${target.role}`,
          afterRef: `role:${input.role}`,
          reasonCode: 'tenant_role_changed',
        },
        tx,
      );
      return changed;
    });

    return updated.toSummary();
  }
}
