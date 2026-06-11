import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  DocumentConfidentialityLevel,
  DocumentPermissionService as SharedDocumentPermissionService,
  DocumentPrivilegeStatus,
  DocumentStatus,
  MatterMemberAccessLevel,
  MatterMemberRole,
  PermissionContext,
  PermissionDecision,
  TenantId,
  UserRole,
} from '@amic-vault/shared';
import { allowPermission, denyPermission, isUserRole } from '@amic-vault/shared';
import {
  effectiveConfidentialityLevel,
  requiresDownloadReason,
  requiresExplicitDocumentAllow,
  roleAllowsDocumentAction,
  type DocumentPermissionAction,
} from './confidentiality-policy';
import {
  FailClosedPermissionWrapper,
  type PermissionAuditTarget,
} from './fail-closed.wrapper';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface DocumentActorSnapshot {
  userId: string;
  role: UserRole;
  status: string;
}

export interface DocumentPermissionTarget {
  documentId: string;
  tenantId: TenantId;
  matterId: string;
  status: DocumentStatus;
  matterStatus: string;
  confidentialityLevel: DocumentConfidentialityLevel;
  privilegeStatus: DocumentPrivilegeStatus;
}

export interface DocumentMatterMemberSnapshot {
  matterRole: MatterMemberRole;
  accessLevel: MatterMemberAccessLevel;
}

export interface ExplicitDocumentPermissionRow {
  effect: 'ALLOW' | 'DENY';
  condition_json: Record<string, unknown> | null;
}

export interface DocumentWallDecision {
  blocked: boolean;
  appliedRules: string[];
}

function documentAuditTarget(
  ctx: PermissionContext,
  documentId: string,
): PermissionAuditTarget {
  return {
    tenantId: ctx.tenantId as TenantId,
    actorId: ctx.userId,
    targetType: 'document',
    targetId: documentId,
  };
}

function hasUnsupportedCondition(row: ExplicitDocumentPermissionRow): boolean {
  return row.condition_json !== null && Object.keys(row.condition_json).length > 0;
}

@Injectable()
export class DocumentPermissionService implements SharedDocumentPermissionService {
  constructor(
    @Inject(FailClosedPermissionWrapper)
    private readonly wrapper: FailClosedPermissionWrapper,
  ) {}

  canReadDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(documentAuditTarget(ctx, documentId), () =>
      this.evaluateDocumentAction(ctx, documentId, 'read'),
    );
  }

  canDownloadDocument(
    ctx: PermissionContext,
    documentId: string,
    reason?: string,
  ): Promise<PermissionDecision> {
    return this.wrapper.evaluate(documentAuditTarget(ctx, documentId), () =>
      this.evaluateDocumentAction(ctx, documentId, 'download', reason),
    );
  }

  protected async evaluateDocumentAction(
    ctx: PermissionContext,
    documentId: string,
    action: DocumentPermissionAction,
    reason?: string,
  ): Promise<PermissionDecision> {
    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor || actor.status !== 'active') {
      return denyPermission('PERMISSION_DENIED', ['actor:inactive_or_missing']);
    }
    if (!roleAllowsDocumentAction(actor.role, action)) {
      return denyPermission('PERMISSION_DENIED', [`document.${action}:role_deny`]);
    }

    const target = await this.findDocumentTarget(ctx.tenantId as TenantId, documentId);
    if (!target) return denyPermission('PERMISSION_DENIED', ['document:missing']);
    if (target.status === 'deleted') {
      return denyPermission('DOCUMENT_LOCKED', ['document.status:deleted']);
    }

    const wall = await this.evaluateWall(ctx.tenantId as TenantId, target.matterId, ctx.userId);
    if (wall.blocked) {
      return denyPermission('ETHICAL_WALL_BLOCKED', wall.appliedRules);
    }

    const member = await this.findMatterMember(
      ctx.tenantId as TenantId,
      target.matterId,
      ctx.userId,
    );
    if (!member) return denyPermission('PERMISSION_DENIED', ['matter_members:missing']);

    const explicit = await this.evaluateExplicitDocumentPermissions(
      ctx.tenantId as TenantId,
      documentId,
      actor,
      action,
    );
    if (explicit.effect === 'DENY') return explicit;

    const effectiveLevel = effectiveConfidentialityLevel({
      confidentialityLevel: target.confidentialityLevel,
      privilegeStatus: target.privilegeStatus,
    });
    const explicitAllow = explicit.appliedRules.includes('permissions:explicit_allow');
    if (actor.role === 'limited_reviewer' && !explicitAllow) {
      return denyPermission('PERMISSION_DENIED', ['document.limited_reviewer:explicit_allow_required']);
    }
    if (requiresExplicitDocumentAllow(effectiveLevel) && !explicitAllow) {
      return denyPermission('PERMISSION_DENIED', [
        `document.confidentiality:${effectiveLevel}:explicit_allow_required`,
      ]);
    }
    if (action === 'download' && requiresDownloadReason(effectiveLevel) && !reason) {
      return denyPermission('VALIDATION_FAILED', ['document.download:reason_required']);
    }

    return allowPermission([
      `document.${action}:role_allow`,
      'matter_members:present',
      `document.confidentiality:${effectiveLevel}`,
      ...explicit.appliedRules,
    ]);
  }

  protected async findActor(
    tenantId: TenantId,
    userId: string,
  ): Promise<DocumentActorSnapshot | null> {
    const result = await getPool().query<{
      user_id: string;
      role: string;
      status: string;
    }>(
      `
        SELECT user_id, role, status
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    const row = result.rows[0];
    if (!row || !isUserRole(row.role)) return null;
    return { userId: row.user_id, role: row.role, status: row.status };
  }

  protected async findDocumentTarget(
    tenantId: TenantId,
    documentId: string,
  ): Promise<DocumentPermissionTarget | null> {
    const result = await getPool().query<{
      document_id: string;
      tenant_id: TenantId;
      matter_id: string;
      status: DocumentStatus;
      matter_status: string;
      confidentiality_level: DocumentConfidentialityLevel;
      privilege_status: DocumentPrivilegeStatus;
    }>(
      `
        SELECT d.document_id, d.tenant_id, d.matter_id, d.status,
          m.status AS matter_status, d.confidentiality_level, d.privilege_status
        FROM documents d
        JOIN matters m
          ON m.tenant_id = d.tenant_id
          AND m.matter_id = d.matter_id
        WHERE d.tenant_id = $1
          AND d.document_id = $2
        LIMIT 1
      `,
      [tenantId, documentId],
    );
    const row = result.rows[0];
    return row
      ? {
          documentId: row.document_id,
          tenantId: row.tenant_id,
          matterId: row.matter_id,
          status: row.status,
          matterStatus: row.matter_status,
          confidentialityLevel: row.confidentiality_level,
          privilegeStatus: row.privilege_status,
        }
      : null;
  }

  protected async findMatterMember(
    tenantId: TenantId,
    matterId: string,
    userId: string,
  ): Promise<DocumentMatterMemberSnapshot | null> {
    const result = await getPool().query<DocumentMatterMemberSnapshot>(
      `
        SELECT matter_role AS "matterRole", access_level AS "accessLevel"
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, userId],
    );
    return result.rows[0] ?? null;
  }

  protected async evaluateWall(
    tenantId: TenantId,
    matterId: string,
    userId: string,
  ): Promise<DocumentWallDecision> {
    const result = await getPool().query<{
      wall_id: string;
      has_insider: boolean;
      user_is_insider: boolean;
      user_is_excluded: boolean;
    }>(
      `
        WITH user_subjects AS (
          SELECT 'user'::text AS subject_type, $3::text AS subject_id
          UNION ALL
          SELECT 'group', gm.group_id::text
          FROM group_members gm
          WHERE gm.tenant_id = $1
            AND gm.user_id = $3::uuid
        )
        SELECT ew.wall_id,
          EXISTS (
            SELECT 1 FROM ethical_wall_memberships ewm
            WHERE ewm.tenant_id = ew.tenant_id
              AND ewm.wall_id = ew.wall_id
              AND ewm.membership_type = 'insider'
          ) AS has_insider,
          EXISTS (
            SELECT 1 FROM ethical_wall_memberships ewm
            JOIN user_subjects us
              ON us.subject_type = ewm.subject_type
             AND us.subject_id = ewm.subject_id::text
            WHERE ewm.tenant_id = ew.tenant_id
              AND ewm.wall_id = ew.wall_id
              AND ewm.membership_type = 'insider'
          ) AS user_is_insider,
          EXISTS (
            SELECT 1 FROM ethical_wall_memberships ewm
            JOIN user_subjects us
              ON us.subject_type = ewm.subject_type
             AND us.subject_id = ewm.subject_id::text
            WHERE ewm.tenant_id = ew.tenant_id
              AND ewm.wall_id = ew.wall_id
              AND ewm.membership_type = 'excluded'
          ) AS user_is_excluded
        FROM ethical_walls ew
        WHERE ew.tenant_id = $1
          AND ew.matter_id = $2
          AND ew.status = 'active'
      `,
      [tenantId, matterId, userId],
    );
    for (const wall of result.rows) {
      if (wall.user_is_excluded) {
        return { blocked: true, appliedRules: ['ethical_wall:excluded'] };
      }
      if (wall.has_insider && !wall.user_is_insider) {
        return { blocked: true, appliedRules: ['ethical_wall:insider_required'] };
      }
    }
    return { blocked: false, appliedRules: [] };
  }

  protected async findExplicitDocumentPermissionRows(
    tenantId: TenantId,
    documentId: string,
    actor: DocumentActorSnapshot,
    action: DocumentPermissionAction,
  ): Promise<ExplicitDocumentPermissionRow[]> {
    const result = await getPool().query<ExplicitDocumentPermissionRow>(
      `
        SELECT effect, condition_json
        FROM permissions p
        WHERE p.tenant_id = $1
          AND p.resource_type = 'document'
          AND p.resource_id = $2
          AND p.action = $5
          AND (p.valid_from IS NULL OR p.valid_from <= now())
          AND (p.valid_to IS NULL OR p.valid_to > now())
          AND (
            (p.subject_type = 'user' AND p.subject_id = $3)
            OR (p.subject_type = 'role' AND p.subject_id = $4)
            OR (
              p.subject_type = 'group'
              AND p.subject_id IN (
                SELECT gm.group_id::text
                FROM group_members gm
                WHERE gm.tenant_id = p.tenant_id
                  AND gm.user_id = $3::uuid
              )
            )
          )
        ORDER BY priority ASC, effect DESC
      `,
      [tenantId, documentId, actor.userId, actor.role, action],
    );
    return result.rows;
  }

  private async evaluateExplicitDocumentPermissions(
    tenantId: TenantId,
    documentId: string,
    actor: DocumentActorSnapshot,
    action: DocumentPermissionAction,
  ): Promise<PermissionDecision> {
    const rows = await this.findExplicitDocumentPermissionRows(tenantId, documentId, actor, action);
    if (rows.some((row) => row.effect === 'DENY')) {
      return denyPermission('PERMISSION_DENIED', ['permissions:explicit_deny']);
    }
    if (rows.some((row) => row.effect === 'ALLOW' && !hasUnsupportedCondition(row))) {
      return allowPermission(['permissions:explicit_allow']);
    }
    if (rows.some((row) => row.effect === 'ALLOW' && hasUnsupportedCondition(row))) {
      return allowPermission(['permissions:allow_condition_ignored']);
    }
    return allowPermission(['permissions:none']);
  }
}
