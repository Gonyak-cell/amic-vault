import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  AddMatterMemberDto,
  MatterMemberAccessLevel,
  MatterMemberListDto,
  MatterMemberRole,
  TenantId,
  UpdateMatterMemberDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { MatterMemberEntity } from './matter-member.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface MatterMemberRow {
  matter_id: string;
  tenant_id: string;
  user_id: string;
  matter_role: MatterMemberRole;
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
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async list(actorUserId: string, matterId: string): Promise<MatterMemberListDto> {
    const context = this.tenantContext.require();
    await this.assertMatterExists(context.tenantId, matterId);
    const canManage = await this.canManageMembers(context.tenantId, actorUserId, matterId);
    const isMember = await this.isMember(context.tenantId, matterId, actorUserId);
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!canManage && !isMember && actor?.role !== 'firm_admin') {
      await this.permissionEvents.recordAccessDenied({
        tenantId: context.tenantId,
        actorId: actorUserId,
        targetType: 'matter',
        targetId: matterId,
        matterId,
        reasonCode: 'PERMISSION_DENIED',
      });
      throw permissionDenied();
    }
    const result = await getPool().query<MatterMemberRow>(
      `
        SELECT matter_id, tenant_id, user_id, matter_role, access_level, added_by, added_at
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY matter_role = 'owner' DESC, added_at ASC, user_id
      `,
      [context.tenantId, matterId],
    );
    return {
      items: result.rows.map(mapMatterMember).map((member) => member.toDto()),
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

  async update(actorUserId: string, matterId: string, userId: string, input: UpdateMatterMemberDto) {
    const context = this.tenantContext.require();
    await this.assertCanManageOrDeny(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    const before = await this.findMember(context.tenantId, matterId, userId);
    if (!before) throw notFoundDenied();
    const nextRole = input.matterRole ?? before.props.matterRole;
    const nextAccess = input.accessLevel ?? before.props.accessLevel;
    if (nextRole === 'limited_reviewer' && nextAccess === 'edit') throw validationFailed();
    if (
      before.props.matterRole === 'owner' &&
      nextRole !== 'owner'
    ) {
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
    const result = await getPool().query(
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

  async canManageMembers(tenantId: TenantId, actorUserId: string, matterId: string): Promise<boolean> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active') return false;
    if (actor.role === 'firm_admin') return true;
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
    if (await this.canManageMembers(tenantId, actorUserId, matterId)) return;
    await this.permissionEvents.recordAccessDenied({
      tenantId,
      actorId: actorUserId,
      targetType: 'matter',
      targetId: matterId,
      matterId,
      reasonCode: 'PERMISSION_DENIED',
    });
    throw permissionDenied();
  }

  private async assertMatterExists(tenantId: TenantId, matterId: string): Promise<MatterRow> {
    const result = await getPool().query<MatterRow>(
      'SELECT matter_id, status FROM matters WHERE tenant_id = $1 AND matter_id = $2 LIMIT 1',
      [tenantId, matterId],
    );
    const row = result.rows[0];
    if (!row) throw notFoundDenied();
    return row;
  }

  private async assertMatterMutable(tenantId: TenantId, matterId: string): Promise<void> {
    const matter = await this.assertMatterExists(tenantId, matterId);
    if (matter.status === 'closed' || matter.status === 'archived') throw permissionDenied();
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
    const result = await getPool().query<{ count: string }>(
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
    queryClient: QueryClient = getPool(),
  ): Promise<MatterMemberEntity | null> {
    const result = await queryClient.query(
      `
        SELECT matter_id, tenant_id, user_id, matter_role, access_level, added_by, added_at
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
          AND user_id = $3
      `,
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

