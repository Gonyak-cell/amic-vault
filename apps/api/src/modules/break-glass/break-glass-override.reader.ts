import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../../common/db/database.service';
import { tenantQuery } from '../../common/db/tenant-query';

export interface BreakGlassOverride {
  requestId: string;
  wallId: string;
  expiresAt: Date;
}

@Injectable()
export class BreakGlassOverrideReader {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
  ) {}

  async findActiveOverride(
    tenantId: TenantId,
    matterId: string,
    userId: string,
    wallId?: string,
  ): Promise<BreakGlassOverride | null> {
    const result = await tenantQuery<{
      request_id: string;
      wall_id: string;
      expires_at: Date;
    }>(
      this.databaseService,
      tenantId,
      `
        SELECT bgr.request_id, bgr.wall_id, bgr.expires_at
        FROM break_glass_requests bgr
        JOIN ethical_walls ew
          ON ew.tenant_id = bgr.tenant_id
         AND ew.wall_id = bgr.wall_id
        WHERE bgr.tenant_id = $1
          AND ew.matter_id = $2
          AND bgr.requester_id = $3::uuid
          AND bgr.status = 'approved'
          AND bgr.revoked_at IS NULL
          AND bgr.expires_at > now()
          AND ew.status = 'active'
          AND ($4::uuid IS NULL OR bgr.wall_id = $4::uuid)
          AND (
            SELECT count(*)
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = bgr.tenant_id
              AND bga.request_id = bgr.request_id
          ) >= 2
        ORDER BY bgr.expires_at DESC, bgr.request_id
        LIMIT 1
      `,
      [tenantId, matterId, userId, wallId ?? null],
    );
    const row = result.rows[0];
    return row
      ? { requestId: row.request_id, wallId: row.wall_id, expiresAt: row.expires_at }
      : null;
  }

  async recordOverrideUsed(input: {
    tenantId: TenantId;
    actorId: string;
    matterId: string;
    override: BreakGlassOverride;
  }): Promise<void> {
    await this.auditService.log({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: 'BREAK_GLASS_USED',
      targetType: 'break_glass_request',
      targetId: input.override.requestId,
      matterId: input.matterId,
      metadata: {
        request_id: input.override.requestId,
        wall_id: input.override.wallId,
        matter_id: input.matterId,
        requester_user_id: input.actorId,
        expires_at: input.override.expiresAt.toISOString(),
      },
    });
  }

}
