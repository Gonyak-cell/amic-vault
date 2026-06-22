import { Inject, Injectable, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import { isMatterMutationBlockedState, isMatterState } from '@amic-vault/domain';
import type {
  MatterMemberAccessLevel,
  MatterMemberRole,
  PermissionAttributeContext,
  PermissionDecision,
  PermissionContext,
  RolePermissionAction,
  TenantId,
  UserRole,
} from '@amic-vault/shared';
import {
  allowPermission,
  denyPermission,
  evaluatePermissionCondition,
  isUserRole,
  rolePermissionDecision,
} from '@amic-vault/shared';
import {
  FailClosedPermissionWrapper,
  type PermissionAuditTarget,
} from './fail-closed.wrapper';
import { WallMembershipReader } from './wall-membership.reader';
import { DocumentPermissionService } from './document-permission.service';
import { BreakGlassOverrideReader } from '../break-glass/break-glass-override.reader';
import { tenantQuery } from '../../common/db/tenant-query';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface ActorSnapshot {
  userId: string;
  role: UserRole;
  status: string;
  practiceGroup?: string | null;
}

export interface MatterSnapshot {
  matterId: string;
  tenantId: TenantId;
  status: string;
  clientId?: string | null;
  practiceGroup?: string | null;
}

export interface MatterMemberSnapshot {
  matterRole: MatterMemberRole;
  accessLevel: MatterMemberAccessLevel;
}

export interface ExplicitPermissionRow {
  effect: 'ALLOW' | 'DENY';
  condition_json: Record<string, unknown> | null;
  permissionId?: string;
  priority?: number;
}

type MatterPermissionAction = 'read' | 'edit' | 'upload' | 'manage_members';

function auditTarget(ctx: PermissionContext, matterId: string): PermissionAuditTarget {
  return {
    tenantId: ctx.tenantId as TenantId,
    actorId: ctx.userId,
    targetType: 'matter',
    targetId: matterId,
    matterId,
  };
}

function rolePermits(action: RolePermissionAction, role: UserRole): boolean {
  return rolePermissionDecision(role, action) !== 'deny';
}

function canEditFromMember(member: MatterMemberSnapshot): boolean {
  if (member.matterRole === 'limited_reviewer') return false;
  return member.matterRole === 'owner' || member.accessLevel === 'edit';
}

function matterConditionContext(
  actor: ActorSnapshot,
  matter: MatterSnapshot,
): PermissionAttributeContext {
  return {
    actor: {
      role: actor.role,
      practiceGroup: actor.practiceGroup ?? null,
    },
    matter: {
      status: matter.status,
      practiceGroup: matter.practiceGroup ?? null,
      clientId: matter.clientId ?? null,
    },
  };
}

@Injectable()
export class PermissionService {
  constructor(
    @Inject(FailClosedPermissionWrapper)
    private readonly wrapper: FailClosedPermissionWrapper,
    @Inject(WallMembershipReader) private readonly wallMembershipReader: WallMembershipReader,
    @Optional()
    @Inject(BreakGlassOverrideReader)
    private readonly breakGlassOverrideReader?: BreakGlassOverrideReader,
    @Optional()
    @Inject(DocumentPermissionService)
    private readonly documentPermissionService?: DocumentPermissionService,
  ) {}

  canReadMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(auditTarget(ctx, matterId), () =>
      this.evaluateCanReadMatter(ctx, matterId),
    );
  }

  canEditMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(auditTarget(ctx, matterId), () =>
      this.evaluateCanEditMatter(ctx, matterId),
    );
  }

  canUploadToMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(auditTarget(ctx, matterId), () =>
      this.evaluateCanUploadToMatter(ctx, matterId),
    );
  }

  canManageMatterMembers(ctx: PermissionContext, matterId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(auditTarget(ctx, matterId), () =>
      this.evaluateCanManageMatterMembers(ctx, matterId),
    );
  }

  canReadDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canReadDocument(ctx, documentId);
  }

  canDownloadDocument(
    ctx: PermissionContext,
    documentId: string,
    reason?: string,
  ): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canDownloadDocument(ctx, documentId, reason);
  }

  canCheckoutDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canCheckoutDocument(ctx, documentId);
  }

  canSaveDocumentSubversion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canSaveDocumentSubversion(ctx, documentId);
  }

  canReadDocumentSubversion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canReadDocumentSubversion(ctx, documentId);
  }

  canCheckInDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canCheckInDocument(ctx, documentId);
  }

  canPromoteDocumentVersion(
    ctx: PermissionContext,
    documentId: string,
  ): Promise<PermissionDecision> {
    if (!this.documentPermissionService) {
      return Promise.resolve(denyPermission('NOT_IMPLEMENTED', ['document_permission:missing']));
    }
    return this.documentPermissionService.canPromoteDocumentVersion(ctx, documentId);
  }

  canReadDocumentAudit(ctx: PermissionContext, matterId: string): Promise<PermissionDecision> {
    return this.wrapper.evaluate(auditTarget(ctx, matterId), () =>
      this.evaluateCanReadDocumentAudit(ctx, matterId),
    );
  }

  protected async evaluateCanReadDocumentAudit(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<PermissionDecision> {
    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor || actor.status !== 'active') {
      return denyPermission('PERMISSION_DENIED', ['actor:inactive_or_missing']);
    }

    const roleDecision = rolePermissionDecision(actor.role, 'audit.read.matter');
    if (roleDecision === 'deny') {
      return denyPermission('PERMISSION_DENIED', ['audit.read.matter:role_deny']);
    }

    const matter = await this.findMatter(ctx.tenantId as TenantId, matterId);
    if (!matter) return denyPermission('PERMISSION_DENIED', ['matter:missing']);

    if (roleDecision === 'allow') {
      return allowPermission(['audit.read.matter:role_allow']);
    }

    if (roleDecision === 'owner') {
      const member = await this.findMatterMember(ctx.tenantId as TenantId, matterId, ctx.userId);
      if (member?.matterRole !== 'owner') {
        return denyPermission('PERMISSION_DENIED', ['audit.read.matter:not_owner']);
      }
      const wall = await this.wallMembershipReader.readUserMatterState(
        ctx.tenantId as TenantId,
        matterId,
        ctx.userId,
      );
      if (wall.isExcluded) {
        const overridden = await this.allExcludedWallsOverridden(
          ctx.tenantId as TenantId,
          matterId,
          ctx.userId,
          wall.excludedWallIds ?? wall.wallIds,
        );
        if (!overridden) {
          return denyPermission('ETHICAL_WALL_BLOCKED', ['ethical_wall:excluded']);
        }
      }
      return allowPermission([
        'audit.read.matter:owner',
        ...(wall.isInsider ? ['ethical_wall:insider'] : []),
      ]);
    }

    return denyPermission('PERMISSION_DENIED', ['audit.read.matter:unsupported_decision']);
  }

  protected async evaluateCanReadMatter(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<PermissionDecision> {
    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor || actor.status !== 'active') {
      return denyPermission('PERMISSION_DENIED', ['actor:inactive_or_missing']);
    }
    if (!rolePermits('matter.read', actor.role)) {
      return denyPermission('PERMISSION_DENIED', ['matter.read:role_deny']);
    }

    const matter = await this.findMatter(ctx.tenantId as TenantId, matterId);
    if (!matter) return denyPermission('PERMISSION_DENIED', ['matter:missing']);

    const wall = await this.wallMembershipReader.readUserMatterState(
      ctx.tenantId as TenantId,
      matterId,
      ctx.userId,
    );
    if (wall.isExcluded) {
      const overridden = await this.allExcludedWallsOverridden(
        ctx.tenantId as TenantId,
        matterId,
        ctx.userId,
        wall.excludedWallIds ?? wall.wallIds,
      );
      if (!overridden) {
        return denyPermission('ETHICAL_WALL_BLOCKED', ['ethical_wall:excluded']);
      }
    }

    const member = await this.findMatterMember(ctx.tenantId as TenantId, matterId, ctx.userId);
    if (!member) return denyPermission('PERMISSION_DENIED', ['matter_members:missing']);

    const explicit = await this.evaluateExplicitMatterPermissions(
      ctx.tenantId as TenantId,
      matter,
      actor,
      'read',
    );
    if (explicit.effect === 'DENY') return explicit;

    return allowPermission([
      'matter.read:role_allow',
      'matter_members:present',
      ...explicit.appliedRules,
      ...(wall.isInsider ? ['ethical_wall:insider'] : []),
    ]);
  }

  protected async evaluateCanEditMatter(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<PermissionDecision> {
    const read = await this.evaluateCanReadMatter(ctx, matterId);
    if (read.effect !== 'ALLOW') return read;

    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor || !rolePermits('matter.edit', actor.role)) {
      return denyPermission('PERMISSION_DENIED', ['matter.edit:role_deny']);
    }
    const matter = await this.findMatter(ctx.tenantId as TenantId, matterId);
    if (!matter) return denyPermission('PERMISSION_DENIED', ['matter:missing']);

    const explicit = await this.evaluateExplicitMatterPermissions(
      ctx.tenantId as TenantId,
      matter,
      actor,
      'edit',
    );
    if (explicit.effect === 'DENY') return explicit;

    const member = await this.findMatterMember(ctx.tenantId as TenantId, matterId, ctx.userId);
    if (!member || !canEditFromMember(member)) {
      return denyPermission('PERMISSION_DENIED', ['matter.edit:membership_not_edit']);
    }

    return allowPermission([...read.appliedRules, 'matter.edit:member_edit']);
  }

  protected async evaluateCanUploadToMatter(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<PermissionDecision> {
    const edit = await this.evaluateCanEditMatter(ctx, matterId);
    if (edit.effect !== 'ALLOW') return edit;

    const matter = await this.findMatter(ctx.tenantId as TenantId, matterId);
    if (!matter || !isMatterState(matter.status)) {
      return denyPermission('EVAL_FAILURE', ['matter.status:unreadable']);
    }
    if (isMatterMutationBlockedState(matter.status)) {
      return denyPermission('MATTER_CLOSED', ['matter.status:mutation_blocked']);
    }

    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor) return denyPermission('PERMISSION_DENIED', ['actor:missing']);
    const explicit = await this.evaluateExplicitMatterPermissions(
      ctx.tenantId as TenantId,
      matter,
      actor,
      'upload',
    );
    if (explicit.effect === 'DENY') return explicit;

    return allowPermission([...edit.appliedRules, 'matter.upload:status_open']);
  }

  protected async evaluateCanManageMatterMembers(
    ctx: PermissionContext,
    matterId: string,
  ): Promise<PermissionDecision> {
    const read = await this.evaluateCanReadMatter(ctx, matterId);
    if (read.effect !== 'ALLOW') return read;

    const actor = await this.findActor(ctx.tenantId as TenantId, ctx.userId);
    if (!actor || !rolePermits('matter.member_add', actor.role)) {
      return denyPermission('PERMISSION_DENIED', ['matter.member_manage:role_deny']);
    }
    const matter = await this.findMatter(ctx.tenantId as TenantId, matterId);
    if (!matter) return denyPermission('PERMISSION_DENIED', ['matter:missing']);

    const explicit = await this.evaluateExplicitMatterPermissions(
      ctx.tenantId as TenantId,
      matter,
      actor,
      'manage_members',
    );
    if (explicit.effect === 'DENY') return explicit;

    const member = await this.findMatterMember(ctx.tenantId as TenantId, matterId, ctx.userId);
    if (member?.matterRole !== 'owner') {
      return denyPermission('PERMISSION_DENIED', ['matter.member_manage:not_owner']);
    }

    return allowPermission([...read.appliedRules, 'matter.member_manage:owner']);
  }

  protected async findActor(tenantId: TenantId, userId: string): Promise<ActorSnapshot | null> {
    const result = await tenantQuery<{
      user_id: string;
      role: string;
      status: string;
      practice_group: string | null;
    }>(
      getPool(),
      tenantId,
      `
        SELECT user_id, role, status, practice_group
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [tenantId, userId],
    );
    const row = result.rows[0];
    if (!row || !isUserRole(row.role)) return null;
    return {
      userId: row.user_id,
      role: row.role,
      status: row.status,
      practiceGroup: row.practice_group,
    };
  }

  protected async findMatter(tenantId: TenantId, matterId: string): Promise<MatterSnapshot | null> {
    const result = await tenantQuery<{
      matter_id: string;
      tenant_id: TenantId;
      status: string;
      client_id: string | null;
      practice_group: string | null;
    }>(
      getPool(),
      tenantId,
      `
        SELECT matter_id, tenant_id, status, client_id, practice_group
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0];
    return row
      ? {
          matterId: row.matter_id,
          tenantId: row.tenant_id,
          status: row.status,
          clientId: row.client_id,
          practiceGroup: row.practice_group,
        }
      : null;
  }

  protected async findMatterMember(
    tenantId: TenantId,
    matterId: string,
    userId: string,
  ): Promise<MatterMemberSnapshot | null> {
    const result = await tenantQuery<MatterMemberSnapshot>(
      getPool(),
      tenantId,
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

  protected async findExplicitPermissionRows(
    tenantId: TenantId,
    matterId: string,
    actor: ActorSnapshot,
    action: MatterPermissionAction,
  ): Promise<ExplicitPermissionRow[]> {
    const result = await tenantQuery<ExplicitPermissionRow>(
      getPool(),
      tenantId,
      `
        SELECT permission_id AS "permissionId", effect, condition_json, priority
        FROM permissions p
        WHERE p.tenant_id = $1
          AND p.resource_type = 'matter'
          AND p.resource_id = $2
          AND p.action = $5
          AND (p.valid_from IS NULL OR p.valid_from <= now())
          AND (p.valid_to IS NULL OR p.valid_to >= now())
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
        ORDER BY priority ASC, CASE WHEN effect = 'DENY' THEN 0 ELSE 1 END
      `,
      [tenantId, matterId, actor.userId, actor.role, action],
    );
    return result.rows;
  }

  private async evaluateExplicitMatterPermissions(
    tenantId: TenantId,
    matter: MatterSnapshot,
    actor: ActorSnapshot,
    action: MatterPermissionAction,
  ): Promise<PermissionDecision> {
    const rows = await this.findExplicitPermissionRows(tenantId, matter.matterId, actor, action);
    const context = matterConditionContext(actor, matter);
    let matchedAllow = false;

    for (const row of rows) {
      const evaluation = evaluatePermissionCondition(row.condition_json, context);
      if (evaluation.outcome === 'invalid') {
        return denyPermission('PERMISSION_DENIED', [
          `permissions:condition_invalid:${evaluation.reason ?? 'unknown'}`,
        ]);
      }
      if (evaluation.outcome === 'no_match') continue;
      if (row.effect === 'DENY') {
        return denyPermission('PERMISSION_DENIED', ['permissions:explicit_deny']);
      }
      matchedAllow = true;
    }
    if (matchedAllow) {
      return allowPermission(['permissions:explicit_allow']);
    }
    return allowPermission(['permissions:none']);
  }

  private async allExcludedWallsOverridden(
    tenantId: TenantId,
    matterId: string,
    userId: string,
    wallIds: readonly string[],
  ): Promise<boolean> {
    if (!this.breakGlassOverrideReader || wallIds.length === 0) return false;
    for (const wallId of wallIds) {
      const override = await this.breakGlassOverrideReader.findActiveOverride(
        tenantId,
        matterId,
        userId,
        wallId,
      );
      if (!override) return false;
      await this.breakGlassOverrideReader.recordOverrideUsed({
        tenantId,
        actorId: userId,
        matterId,
        override,
      });
    }
    return true;
  }
}
