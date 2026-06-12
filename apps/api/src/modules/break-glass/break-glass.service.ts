import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  BreakGlassRequestDto,
  BreakGlassRequestStatus,
  CreateBreakGlassRequestDto,
  RevokeBreakGlassRequestDto,
} from '@amic-vault/shared';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context';

interface BreakGlassRequestRow {
  request_id: string;
  tenant_id: string;
  wall_id: string;
  matter_id: string;
  requester_id: string;
  reason_code: string;
  status: BreakGlassRequestStatus;
  expires_at: Date;
  approval_count: string | number;
  approved_at: Date | null;
  revoked_by: string | null;
  revoked_at: Date | null;
  created_at: Date;
}

interface WallRow {
  wall_id: string;
  tenant_id: string;
  matter_id: string;
  status: string;
}

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function mapRequest(row: BreakGlassRequestRow): BreakGlassRequestDto {
  return {
    requestId: row.request_id,
    tenantId: row.tenant_id,
    wallId: row.wall_id,
    matterId: row.matter_id,
    requesterId: row.requester_id,
    reasonCode: row.reason_code as BreakGlassRequestDto['reasonCode'],
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    approvalCount: Number(row.approval_count),
    approvedAt: row.approved_at?.toISOString() ?? null,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class BreakGlassService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async createRequest(actorUserId: string, input: CreateBreakGlassRequestDto) {
    if (!isUuid(input.wallId)) throw validationFailed('invalid_wall_id');
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw validationFailed('invalid_expiry');
    }

    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const wall = await this.findActiveWall(tx, context.tenantId, input.wallId);
      if (!wall) throw notFoundDenied();
      const created = await this.insertRequest(tx, {
        tenantId: context.tenantId,
        wall,
        requesterId: actorUserId,
        reasonCode: input.reasonCode,
        expiresAt,
      });
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'BREAK_GLASS_REQUESTED',
          targetType: 'break_glass_request',
          targetId: created.request_id,
          matterId: wall.matter_id,
          metadata: {
            request_id: created.request_id,
            wall_id: wall.wall_id,
            matter_id: wall.matter_id,
            requester_user_id: actorUserId,
            reason_code: input.reasonCode,
            expires_at: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return mapRequest(created);
    });
  }

  async approveRequest(actorUserId: string, requestId: string) {
    if (!isUuid(requestId)) throw validationFailed('invalid_request_id');
    const context = this.tenantContext.require();
    const outcome = await this.auditService.transaction(context.tenantId, async (tx) => {
      const request = await this.findRequestForUpdate(tx, context.tenantId, requestId);
      if (!request) throw notFoundDenied();
      if (request.requester_id === actorUserId) {
        await this.recordDenied(tx, context.tenantId, actorUserId, request, 'requester_cannot_approve');
        return { effect: 'DENY' as const };
      }
      if (request.status !== 'pending') {
        await this.recordDenied(tx, context.tenantId, actorUserId, request, 'request_not_pending');
        return { effect: 'DENY' as const };
      }
      if (request.expires_at.getTime() <= Date.now()) {
        const expired = await this.markExpired(tx, context.tenantId, request.request_id);
        await this.recordExpired(tx, context.tenantId, actorUserId, expired ?? request);
        return { effect: 'DENY' as const };
      }
      if (await this.hasApproval(tx, context.tenantId, request.request_id, actorUserId)) {
        await this.recordDenied(tx, context.tenantId, actorUserId, request, 'duplicate_approval');
        return { effect: 'DENY' as const };
      }

      await this.insertApproval(tx, context.tenantId, request.request_id, actorUserId);
      const approvalCount = await this.approvalCount(tx, context.tenantId, request.request_id);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'BREAK_GLASS_APPROVED',
          targetType: 'break_glass_request',
          targetId: request.request_id,
          matterId: request.matter_id,
          metadata: {
            request_id: request.request_id,
            wall_id: request.wall_id,
            matter_id: request.matter_id,
            approver_user_id: actorUserId,
            approval_count: approvalCount,
          },
        },
        tx,
      );

      let current = await this.findRequestForUpdate(tx, context.tenantId, request.request_id);
      if (!current) throw notFoundDenied();
      if (approvalCount >= 2) {
        current = await this.markApproved(tx, context.tenantId, request.request_id);
        if (!current) throw notFoundDenied();
        await this.auditService.log(
          {
            tenantId: context.tenantId,
            actorId: actorUserId,
            action: 'BREAK_GLASS_ACTIVATED',
            targetType: 'break_glass_request',
            targetId: request.request_id,
            matterId: request.matter_id,
            metadata: {
              request_id: request.request_id,
              wall_id: request.wall_id,
              matter_id: request.matter_id,
              approval_count: approvalCount,
              expires_at: current.expires_at.toISOString(),
            },
          },
          tx,
        );
      }
      return { effect: 'ALLOW' as const, request: mapRequest(current) };
    });
    if (outcome.effect === 'DENY') throw permissionDenied();
    return outcome.request;
  }

  async revokeRequest(
    actorUserId: string,
    requestId: string,
    input: RevokeBreakGlassRequestDto = {},
  ) {
    if (!isUuid(requestId)) throw validationFailed('invalid_request_id');
    const context = this.tenantContext.require();
    return this.auditService.transaction(context.tenantId, async (tx) => {
      const request = await this.findRequestForUpdate(tx, context.tenantId, requestId);
      if (!request) throw notFoundDenied();
      if (request.status === 'revoked') return mapRequest(request);
      if (request.status === 'expired' || request.expires_at.getTime() <= Date.now()) {
        const expired = await this.markExpired(tx, context.tenantId, request.request_id);
        await this.recordExpired(tx, context.tenantId, actorUserId, expired ?? request);
        return mapRequest(expired ?? request);
      }
      const revoked = await this.markRevoked(tx, context.tenantId, request.request_id, actorUserId);
      if (!revoked) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'BREAK_GLASS_REVOKED',
          targetType: 'break_glass_request',
          targetId: request.request_id,
          matterId: request.matter_id,
          metadata: {
            request_id: request.request_id,
            wall_id: request.wall_id,
            matter_id: request.matter_id,
            revoked_by_user_id: actorUserId,
            reason_code: input.reasonCode ?? 'security_review',
          },
        },
        tx,
      );
      return mapRequest(revoked);
    });
  }

  private async findActiveWall(
    tx: PoolClient,
    tenantId: string,
    wallId: string,
  ): Promise<WallRow | null> {
    const result = await tx.query<WallRow>(
      `
        SELECT wall_id, tenant_id, matter_id, status
        FROM ethical_walls
        WHERE tenant_id = $1
          AND wall_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, wallId],
    );
    return result.rows[0] ?? null;
  }

  private async insertRequest(
    tx: PoolClient,
    input: {
      tenantId: string;
      wall: WallRow;
      requesterId: string;
      reasonCode: string;
      expiresAt: Date;
    },
  ): Promise<BreakGlassRequestRow> {
    const result = await tx.query<BreakGlassRequestRow>(
      `
        INSERT INTO break_glass_requests (
          tenant_id, wall_id, matter_id, requester_id, reason_code, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *, 0 AS approval_count
      `,
      [
        input.tenantId,
        input.wall.wall_id,
        input.wall.matter_id,
        input.requesterId,
        input.reasonCode,
        input.expiresAt.toISOString(),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('break glass request insert returned no row');
    return row;
  }

  private async insertApproval(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
    approverId: string,
  ): Promise<void> {
    await tx.query(
      `
        INSERT INTO break_glass_approvals (tenant_id, request_id, approver_id)
        VALUES ($1, $2, $3)
      `,
      [tenantId, requestId, approverId],
    );
  }

  private async approvalCount(tx: PoolClient, tenantId: string, requestId: string): Promise<number> {
    const result = await tx.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM break_glass_approvals
        WHERE tenant_id = $1
          AND request_id = $2
      `,
      [tenantId, requestId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async hasApproval(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
    approverId: string,
  ): Promise<boolean> {
    const result = await tx.query(
      `
        SELECT 1
        FROM break_glass_approvals
        WHERE tenant_id = $1
          AND request_id = $2
          AND approver_id = $3
        LIMIT 1
      `,
      [tenantId, requestId, approverId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async findRequestForUpdate(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<BreakGlassRequestRow | null> {
    const result = await tx.query<BreakGlassRequestRow>(
      `
        SELECT bgr.*,
          (
            SELECT count(*)::text
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = bgr.tenant_id
              AND bga.request_id = bgr.request_id
          ) AS approval_count
        FROM break_glass_requests bgr
        WHERE bgr.tenant_id = $1
          AND bgr.request_id = $2
        FOR UPDATE
      `,
      [tenantId, requestId],
    );
    return result.rows[0] ?? null;
  }

  private async markApproved(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<BreakGlassRequestRow | null> {
    const result = await tx.query<BreakGlassRequestRow>(
      `
        UPDATE break_glass_requests
        SET status = 'approved',
          approved_at = COALESCE(approved_at, now())
        WHERE tenant_id = $1
          AND request_id = $2
          AND status = 'pending'
        RETURNING *,
          (
            SELECT count(*)::text
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = break_glass_requests.tenant_id
              AND bga.request_id = break_glass_requests.request_id
          ) AS approval_count
      `,
      [tenantId, requestId],
    );
    return result.rows[0] ?? null;
  }

  private async markRevoked(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
    revokedBy: string,
  ): Promise<BreakGlassRequestRow | null> {
    const result = await tx.query<BreakGlassRequestRow>(
      `
        UPDATE break_glass_requests
        SET status = 'revoked',
          revoked_by = $3,
          revoked_at = now()
        WHERE tenant_id = $1
          AND request_id = $2
          AND status IN ('pending', 'approved')
        RETURNING *,
          (
            SELECT count(*)::text
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = break_glass_requests.tenant_id
              AND bga.request_id = break_glass_requests.request_id
          ) AS approval_count
      `,
      [tenantId, requestId, revokedBy],
    );
    return result.rows[0] ?? null;
  }

  private async markExpired(
    tx: PoolClient,
    tenantId: string,
    requestId: string,
  ): Promise<BreakGlassRequestRow | null> {
    const result = await tx.query<BreakGlassRequestRow>(
      `
        UPDATE break_glass_requests
        SET status = 'expired'
        WHERE tenant_id = $1
          AND request_id = $2
          AND status IN ('pending', 'approved')
        RETURNING *,
          (
            SELECT count(*)::text
            FROM break_glass_approvals bga
            WHERE bga.tenant_id = break_glass_requests.tenant_id
              AND bga.request_id = break_glass_requests.request_id
          ) AS approval_count
      `,
      [tenantId, requestId],
    );
    return result.rows[0] ?? null;
  }

  private async recordDenied(
    tx: PoolClient,
    tenantId: string,
    actorUserId: string,
    request: BreakGlassRequestRow,
    reasonCode: string,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId,
        actorId: actorUserId,
        action: 'ACCESS_DENIED',
        targetType: 'break_glass_request',
        targetId: request.request_id,
        matterId: request.matter_id,
        result: 'denied',
        metadata: {
          request_id: request.request_id,
          wall_id: request.wall_id,
          matter_id: request.matter_id,
          reason_code: reasonCode,
        },
      },
      tx,
    );
  }

  private async recordExpired(
    tx: PoolClient,
    tenantId: string,
    actorUserId: string,
    request: BreakGlassRequestRow,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId,
        actorId: actorUserId,
        action: 'BREAK_GLASS_EXPIRED',
        targetType: 'break_glass_request',
        targetId: request.request_id,
        matterId: request.matter_id,
        result: 'denied',
        metadata: {
          request_id: request.request_id,
          wall_id: request.wall_id,
          matter_id: request.matter_id,
          expires_at: request.expires_at.toISOString(),
        },
      },
      tx,
    );
  }
}
