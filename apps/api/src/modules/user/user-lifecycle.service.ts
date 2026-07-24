import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantId, UserStatus } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PgPasswordResetStore } from '../auth/password-reset.service';
import { SessionRepository } from '../auth/session.repository';
import { PreviewSessionService } from '../preview/preview-session.service';
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
    @Inject(PreviewSessionService) private readonly previewSessions: PreviewSessionService,
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
        await this.previewSessions.revokeAllForUser(tenantId, targetUserId, client);
        await this.revokeQueuedUploadAuthority(client, tenantId, targetUserId);
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

  private async revokeQueuedUploadAuthority(
    client: QueryClient,
    tenantId: TenantId,
    userId: string,
  ): Promise<void> {
    const cancelled = (await client.query(
      `
        UPDATE bulk_upload_batch_items
        SET status = 'failed',
            error_code = 'PERMISSION_DENIED',
            error_reason = 'USER_DEACTIVATED',
            updated_at = now()
        WHERE tenant_id = $1
          AND actor_user_id = $2
          AND status IN ('pending', 'uploaded')
        RETURNING batch_id
      `,
      [tenantId, userId],
    )) as { rows: Array<{ batch_id: string }>; rowCount: number | null };
    const batchIds = [...new Set(cancelled.rows.map((row) => row.batch_id))];
    if (batchIds.length === 0) return;

    await client.query(
      `
        UPDATE bulk_upload_batches b
        SET status = CASE
              WHEN EXISTS (
                SELECT 1 FROM bulk_upload_batch_items i
                WHERE i.tenant_id = b.tenant_id
                  AND i.batch_id = b.batch_id
                  AND i.status IN ('pending', 'uploaded')
              ) THEN 'processing'
              WHEN EXISTS (
                SELECT 1 FROM bulk_upload_batch_items i
                WHERE i.tenant_id = b.tenant_id
                  AND i.batch_id = b.batch_id
                  AND i.status IN ('failed', 'duplicate')
              ) THEN 'failed'
              ELSE 'done'
            END,
            updated_at = now()
        WHERE b.tenant_id = $1
          AND b.batch_id = ANY($2::uuid[])
      `,
      [tenantId, batchIds],
    );
  }
}
