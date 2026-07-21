import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantId, UserStatus } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { PgPasswordResetStore } from '../auth/password-reset.service';
import { SessionRepository } from '../auth/session.repository';
import { UserService } from './user.service';

type LifecycleStatus = Extract<UserStatus, 'active' | 'inactive'>;

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function lifecycleConflict(reason: string): ConflictException {
  return new ConflictException({ code: 'VALIDATION_FAILED', reason });
}

@Injectable()
export class UserLifecycleService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PgPasswordResetStore) private readonly passwordResetStore: PgPasswordResetStore,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(UserService) private readonly users: UserService,
  ) {}

  async deactivate(tenantId: TenantId, actorUserId: string, targetUserId: string) {
    return this.changeStatus(tenantId, actorUserId, targetUserId, 'inactive');
  }

  async reactivate(tenantId: TenantId, actorUserId: string, targetUserId: string) {
    return this.changeStatus(tenantId, actorUserId, targetUserId, 'active');
  }

  private async changeStatus(
    tenantId: TenantId,
    actorUserId: string,
    targetUserId: string,
    statusAfter: LifecycleStatus,
  ) {
    const actor = await this.users.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active' || actor.role !== 'firm_admin') {
      throw permissionDenied();
    }

    const target = await this.users.findByTenantAndId(tenantId, targetUserId);
    if (!target) throw notFoundDenied();
    if (target.status === 'locked') throw lifecycleConflict('locked_user_lifecycle_blocked');
    if (target.status === statusAfter) return target.toSummary();

    if (statusAfter === 'inactive' && target.role === 'firm_admin' && target.status === 'active') {
      const activeFirmAdmins = await this.users.countActiveUsersByRole(tenantId, 'firm_admin');
      if (activeFirmAdmins <= 1) throw lifecycleConflict('last_active_firm_admin');
    }

    const updated = await this.auditService.transaction(tenantId, async (client) => {
      const changed = await this.users.updateStatus(tenantId, targetUserId, statusAfter, client);
      if (!changed) throw notFoundDenied();
      if (statusAfter === 'inactive') {
        await this.sessions.revokeAllForUser(tenantId, targetUserId, client);
        await this.passwordResetStore.revokeOpenTokensForUser(tenantId, targetUserId, client);
      }
      await this.auditService.log(
        {
          tenantId,
          actorId: actorUserId,
          action: statusAfter === 'inactive' ? 'USER_DEACTIVATED' : 'USER_REACTIVATED',
          targetType: 'user',
          targetId: targetUserId,
          metadata: {
            reason_code:
              statusAfter === 'inactive' ? 'admin_user_deactivated' : 'admin_user_reactivated',
            status_before: target.status,
            status_after: statusAfter,
          },
        },
        client,
      );
      return changed;
    });

    return updated.toSummary();
  }
}
