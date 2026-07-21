import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddMatterMemberDto,
  MatterMemberAccessLevel,
  MatterMemberListDto,
  MatterMemberRole,
  PermissionDecision,
  TenantId,
  UpdateMatterMemberDto,
} from '@amic-vault/shared';
import { buildSafeLabel } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DatabaseService } from '../../common/db/database.service';
import { tenantQuery } from '../../common/db/tenant-query';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { assertMatterMutationAllowed } from './guards/matter-mutability.guard';
import { MatterMemberEntity } from './matter-member.entity';

interface MatterMemberRow {
  matter_id: string;
  tenant_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  matter_role: MatterMemberRole;
  lead_role: 'lead_partner' | 'lead_associate' | null;
  access_level: MatterMemberAccessLevel;
  added_by: string;
  added_at: Date;
}

interface MatterRow {
  matter_id: string;
  status: string;
}

function mapMatterMember(row: MatterMemberRow): MatterMemberEntity {
  return new MatterMemberEntity({
    matterId: row.matter_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    matterRole: row.matter_role,
    accessLevel: row.access_level,
    addedBy: row.added_by,
    addedAt: row.added_at,
  });
}

function mapMatterMemberDto(row: MatterMemberRow) {
  const dto = mapMatterMember(row).toDto();
  const userDisplayName = row.user_name ?? null;
  const userDisplayEmail = row.user_email ?? null;
  return {
    ...dto,
    displayName: userDisplayName,
    displayEmail: userDisplayEmail,
    userDisplayName,
    userDisplayEmail,
    safeLabel: buildSafeLabel(userDisplayName, userDisplayEmail),
    canViewSensitiveRef: false,
    leadRole: row.lead_role,
  };
}

function memberRef(member: MatterMemberEntity | null): string {
  if (!member) return 'none';
  return `member:${member.props.userId}:${member.props.matterRole}:${member.props.accessLevel}`;
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function conflictFailed(): ConflictException {
  return new ConflictException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class MatterMemberService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async list(actorUserId: string, matterId: string): Promise<MatterMemberListDto> {
    const context = this.tenantContext.require();
    await this.assertMatterExists(context.tenantId, matterId);
    const read = await this.permissionService.canReadMatter(
      { tenantId: context.tenantId, userId: actorUserId },
      matterId,
    );
    if (read.effect !== 'ALLOW') throwReadDenied(read);
    const canManage = await this.canManageMembers(context.tenantId, actorUserId, matterId);
    const result = await tenantQuery<MatterMemberRow>(
      this.databaseService,
      context.tenantId,
      `
        SELECT mm.matter_id, mm.tenant_id, mm.user_id, u.name AS user_name, u.email AS user_email,
          mm.matter_role,
          CASE
            WHEN mm.user_id = m.lead_partner_id THEN 'lead_partner'
            WHEN mm.user_id = m.lead_associate_id THEN 'lead_associate'
            ELSE NULL
          END AS lead_role,
          mm.access_level, mm.added_by, mm.added_at
        FROM matter_members mm
        JOIN matters m
          ON m.tenant_id = mm.tenant_id
         AND m.matter_id = mm.matter_id
        LEFT JOIN users u
          ON u.tenant_id = mm.tenant_id
          AND u.user_id = mm.user_id
        WHERE mm.tenant_id = $1
          AND mm.matter_id = $2
        ORDER BY mm.matter_role = 'owner' DESC, mm.added_at ASC, mm.user_id
      `,
      [context.tenantId, matterId],
    );
    return {
      items: result.rows.map(mapMatterMemberDto),
      canManage,
    };
  }

  async add(actorUserId: string, matterId: string, input: AddMatterMemberDto) {
    const context = this.tenantContext.require();
    await this.assertCanManageOrDeny(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.assertUserAddable(context.tenantId, input.userId);
    if (await this.findMember(context.tenantId, matterId, input.userId)) throw conflictFailed();

    const created = await this.auditService.transaction(context.tenantId, async (tx) =>
      this.insertMemberWithAudit(tx, context.tenantId, matterId, actorUserId, input),
    );
    return created.toDto();
  }

  async remove(actorUserId: string, matterId: string, userId: string): Promise<void> {
    const context = this.tenantContext.require();
    await this.assertCanManageOrDeny(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    const before = await this.findMember(context.tenantId, matterId, userId);
    if (!before) throw notFoundDenied();
    if (before.props.matterRole === 'owner') {
      await this.assertAnotherOwnerExists(context.tenantId, matterId, userId);
    }

    await this.auditService.transaction(context.tenantId, async (tx) => {
      await tx.query(
        `
          DELETE FROM matter_members
          WHERE tenant_id = $1
            AND matter_id = $2
            AND user_id = $3
        `,
        [context.tenantId, matterId, userId],
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_MEMBER_REMOVED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            member_user_id: userId,
            role_before: before.props.matterRole,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          targetType: 'matter',
          targetId: matterId,
          matterId,
          beforeRef: memberRef(before),
          afterRef: 'none',
          reasonCode: 'member_removed',
          memberUserId: userId,
        },
        tx,
      );
    });
  }

  async update(
    actorUserId: string,
    matterId: string,
    userId: string,
    input: UpdateMatterMemberDto,
  ) {
    const context = this.tenantContext.require();
    await this.assertCanManageOrDeny(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    const before = await this.findMember(context.tenantId, matterId, userId);
    if (!before) throw notFoundDenied();
    const nextRole = input.matterRole ?? before.props.matterRole;
    const nextAccess = input.accessLevel ?? before.props.accessLevel;
    if (nextRole === 'limited_reviewer' && nextAccess === 'edit') throw validationFailed();
    if (before.props.matterRole === 'owner' && nextRole !== 'owner') {
      await this.assertAnotherOwnerExists(context.tenantId, matterId, userId);
    }
    if (nextRole === before.props.matterRole && nextAccess === before.props.accessLevel) {
      return before.toDto();
    }

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const changed = await this.updateMember(
        tx,
        context.tenantId,
        matterId,
        userId,
        nextRole,
        nextAccess,
      );
      if (!changed) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_MEMBER_ROLE_CHANGED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            member_user_id: userId,
            role_before: before.props.matterRole,
            role_after: nextRole,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          targetType: 'matter',
          targetId: matterId,
          matterId,
          beforeRef: memberRef(before),
          afterRef: memberRef(changed),
          reasonCode: 'member_role_changed',
          memberUserId: userId,
        },
        tx,
      );
      return changed;
    });

    return updated.toDto();
  }

  async addLeadOwner(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    leadLawyerId: string,
    actorUserId: string,
  ): Promise<MatterMemberEntity> {
    return this.insertMemberWithAudit(tx, tenantId, matterId, actorUserId, {
      userId: leadLawyerId,
      matterRole: 'owner',
      accessLevel: 'edit',
    });
  }

  async isMember(tenantId: TenantId, matterId: string, userId: string): Promise<boolean> {
    const result = await tenantQuery(
      this.databaseService,
      tenantId,
      `
        SELECT 1
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [tenantId, matterId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async canManageMembers(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<boolean> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active') return false;
    if (actor.role !== 'matter_owner') return false;
    const member = await this.findMember(tenantId, matterId, actorUserId);
    return member?.props.matterRole === 'owner';
  }

  private async insertMemberWithAudit(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    actorUserId: string,
    input: AddMatterMemberDto,
  ): Promise<MatterMemberEntity> {
    const result = await tx.query(
      `
        INSERT INTO matter_members (
          tenant_id, matter_id, user_id, matter_role, access_level, added_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING matter_id, tenant_id, user_id, matter_role, access_level, added_by, added_at
      `,
      [tenantId, matterId, input.userId, input.matterRole, input.accessLevel, actorUserId],
    );
    const row = result.rows[0] as MatterMemberRow | undefined;
    if (!row) throw new Error('matter member insert returned no row');
    const created = mapMatterMember(row);
    await this.auditService.log(
      {
        tenantId,
        actorId: actorUserId,
        action: 'MATTER_MEMBER_ADDED',
        targetType: 'matter',
        targetId: matterId,
        matterId,
        metadata: {
          matter_id: matterId,
          member_user_id: input.userId,
          role_after: input.matterRole,
        },
      },
      tx,
    );
    await this.permissionEvents.recordPermissionChanged(
      {
        tenantId,
        actorId: actorUserId,
        targetType: 'matter',
        targetId: matterId,
        matterId,
        beforeRef: 'none',
        afterRef: memberRef(created),
        reasonCode: 'member_added',
        memberUserId: input.userId,
      },
      tx,
    );
    return created;
  }

  private async assertCanManageOrDeny(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canManageMatterMembers(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
  }

  private async assertMatterExists(tenantId: TenantId, matterId: string): Promise<MatterRow> {
    const result = await tenantQuery<MatterRow>(
      this.databaseService,
      tenantId,
      'SELECT matter_id, status FROM matters WHERE tenant_id = $1 AND matter_id = $2 LIMIT 1',
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw notFoundDenied();
    return row;
  }

  private async assertMatterMutable(tenantId: TenantId, matterId: string): Promise<void> {
    const matter = await this.assertMatterExists(tenantId, matterId);
    assertMatterMutationAllowed(matter.status);
  }

  private async assertUserAddable(tenantId: TenantId, userId: string): Promise<void> {
    const user = await this.userService.findByTenantAndId(tenantId, userId);
    if (!user) throw notFoundDenied();
    if (user.role === 'external_user') throw permissionDenied();
  }

  private async assertAnotherOwnerExists(
    tenantId: TenantId,
    matterId: string,
    excludedUserId: string,
  ): Promise<void> {
    const result = await tenantQuery<{ count: string }>(
      this.databaseService,
      tenantId,
      `
        SELECT count(*)::text AS count
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND matter_role = 'owner'
          AND user_id <> $3
      `,
      [tenantId, matterId, excludedUserId],
    );
    if (Number(result.rows[0]?.count ?? '0') === 0) throw validationFailed();
  }

  private async findMember(
    tenantId: TenantId,
    matterId: string,
    userId: string,
    queryClient?: QueryClient,
  ): Promise<MatterMemberEntity | null> {
    const sql = `
        SELECT matter_id, tenant_id, user_id, matter_role, access_level, added_by, added_at
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
      `;
    const result = queryClient
      ? await queryClient.query(sql, [tenantId, matterId, userId])
      : await tenantQuery<MatterMemberRow>(
          this.databaseService,
          tenantId,
          sql,
          [tenantId, matterId, userId],
        );
    const row = result.rows[0] as MatterMemberRow | undefined;
    return row ? mapMatterMember(row) : null;
  }

  private async updateMember(
    tx: QueryClient,
    tenantId: TenantId,
    matterId: string,
    userId: string,
    matterRole: MatterMemberRole,
    accessLevel: MatterMemberAccessLevel,
  ): Promise<MatterMemberEntity | null> {
    const result = await tx.query(
      `
        UPDATE matter_members
        SET matter_role = $4,
            access_level = $5
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
        RETURNING matter_id, tenant_id, user_id, matter_role, access_level, added_by, added_at
      `,
      [tenantId, matterId, userId, matterRole, accessLevel],
    );
    const row = result.rows[0] as MatterMemberRow | undefined;
    return row ? mapMatterMember(row) : null;
  }
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw permissionDenied();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw permissionDenied();
  throw permissionDenied();
}
