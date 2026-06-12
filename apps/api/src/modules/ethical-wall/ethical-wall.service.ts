import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  AddEthicalWallMembershipDto,
  CreateEthicalWallDto,
  CreateEthicalWallMemberDto,
  EthicalWallListDto,
  ListEthicalWallsQueryDto,
  TenantId,
  WallMembershipType,
  WallSubjectType,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { TenantContextService } from '../tenant/tenant-context';
import { EthicalWallEntity } from './ethical-wall.entity';
import { WallMembershipEntity } from './wall-membership.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface EthicalWallRow {
  wall_id: string;
  tenant_id: string;
  matter_id: string;
  wall_name: string;
  reason: string;
  status: 'active' | 'released';
  created_by: string;
  created_at: Date;
  released_by: string | null;
  released_at: Date | null;
}

interface WallMembershipRow {
  membership_id: string;
  wall_id: string;
  tenant_id: string;
  subject_type: WallSubjectType;
  subject_id: string;
  membership_type: WallMembershipType;
  created_by: string;
  created_at: Date;
}

function mapWall(row: EthicalWallRow): EthicalWallEntity {
  return new EthicalWallEntity({
    wallId: row.wall_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    wallName: row.wall_name,
    reason: row.reason,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    releasedBy: row.released_by,
    releasedAt: row.released_at,
  });
}

function mapMembership(row: WallMembershipRow): WallMembershipEntity {
  return new WallMembershipEntity({
    membershipId: row.membership_id,
    wallId: row.wall_id,
    tenantId: row.tenant_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    membershipType: row.membership_type,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function permissionDenied(reason?: string): ForbiddenException {
  return new ForbiddenException({
    code: 'PERMISSION_DENIED',
    ...(reason ? { reason } : {}),
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

@Injectable()
export class EthicalWallService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
  ) {}

  async create(actorUserId: string, input: CreateEthicalWallDto) {
    this.assertSupportedMembers(input.members);
    const context = this.tenantContext.require();
    await this.assertMatterExists(context.tenantId, input.matterId);
    await this.assertMemberUsersExist(context.tenantId, input.members);

    const result = await this.auditService.transaction(context.tenantId, async (tx) => {
      const wall = await this.insertWall(tx, context.tenantId, actorUserId, input);
      const memberships = await this.insertMemberships(
        tx,
        context.tenantId,
        actorUserId,
        wall.props.wallId,
        input.members,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'ETHICAL_WALL_CREATED',
          targetType: 'ethical_wall',
          targetId: wall.props.wallId,
          matterId: input.matterId,
          metadata: {
            wall_id: wall.props.wallId,
            matter_id: input.matterId,
          },
        },
        tx,
      );
      for (const membership of memberships) {
        await this.auditService.log(
          {
            tenantId: context.tenantId,
            actorId: actorUserId,
            action: 'ETHICAL_WALL_MEMBERSHIP_CHANGED',
            targetType: 'ethical_wall',
            targetId: wall.props.wallId,
            matterId: input.matterId,
            metadata: {
              wall_id: wall.props.wallId,
              member_user_id: membership.props.subjectId,
            },
          },
          tx,
        );
      }
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'ETHICAL_WALL_APPLIED',
          targetType: 'matter',
          targetId: input.matterId,
          matterId: input.matterId,
          metadata: {
            wall_id: wall.props.wallId,
            matter_id: input.matterId,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          targetType: 'ethical_wall',
          targetId: wall.props.wallId,
          matterId: input.matterId,
          beforeRef: 'none',
          afterRef: `wall:${wall.props.wallId}:active`,
          reasonCode: 'ethical_wall_created',
          wallId: wall.props.wallId,
        },
        tx,
      );
      return {
        wall: wall.toDto(),
        memberships: memberships.map((membership) => membership.toDto()),
      };
    });

    return result;
  }

  async list(_actorUserId: string, query: ListEthicalWallsQueryDto): Promise<EthicalWallListDto> {
    const context = this.tenantContext.require();
    const walls = await this.findWalls(context.tenantId, query);
    const memberships = await this.findMembershipsForWalls(
      context.tenantId,
      walls.map((wall) => wall.wall_id),
    );
    const membershipsByWall = new Map<string, WallMembershipEntity[]>();
    for (const membership of memberships) {
      const group = membershipsByWall.get(membership.props.wallId) ?? [];
      group.push(membership);
      membershipsByWall.set(membership.props.wallId, group);
    }

    return {
      items: walls.map((wall) => ({
        wall: mapWall(wall).toDto(),
        memberships: (membershipsByWall.get(wall.wall_id) ?? []).map((membership) =>
          membership.toDto(),
        ),
      })),
    };
  }

  async addMembership(actorUserId: string, wallId: string, input: AddEthicalWallMembershipDto) {
    if (!isUuid(wallId)) throw validationFailed();
    this.assertSupportedMembers([input]);
    const context = this.tenantContext.require();
    const wall = await this.findWallById(context.tenantId, wallId);
    if (!wall) throw notFoundDenied();
    await this.assertMemberUsersExist(context.tenantId, [input]);
    if (await this.findMembershipForSubject(context.tenantId, wallId, input)) {
      throw validationFailed();
    }

    return this.auditService.transaction(context.tenantId, async (tx) => {
      const [membership] = await this.insertMemberships(tx, context.tenantId, actorUserId, wallId, [
        input,
      ]);
      if (!membership) throw new Error('ethical wall membership insert returned no row');
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'ETHICAL_WALL_MEMBERSHIP_CHANGED',
          targetType: 'ethical_wall',
          targetId: wallId,
          matterId: wall.matter_id,
          metadata: {
            wall_id: wallId,
            member_user_id: membership.props.subjectId,
            matter_id: wall.matter_id,
            after_ref: `wall_membership:${membership.props.subjectId}:${membership.props.membershipType}`,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          targetType: 'ethical_wall',
          targetId: wallId,
          matterId: wall.matter_id,
          beforeRef: 'none',
          afterRef: `wall_membership:${membership.props.subjectId}:${membership.props.membershipType}`,
          reasonCode: 'ethical_wall_membership_added',
          memberUserId: membership.props.subjectId,
          wallId,
        },
        tx,
      );
      return membership.toDto();
    });
  }

  async removeMembership(actorUserId: string, wallId: string, membershipId: string): Promise<void> {
    if (!isUuid(wallId) || !isUuid(membershipId)) throw validationFailed();
    const context = this.tenantContext.require();
    const wall = await this.findWallById(context.tenantId, wallId);
    if (!wall) throw notFoundDenied();
    const before = await this.findMembershipById(context.tenantId, wallId, membershipId);
    if (!before) throw notFoundDenied();

    await this.auditService.transaction(context.tenantId, async (tx) => {
      await tx.query(
        `
          DELETE FROM ethical_wall_memberships
          WHERE tenant_id = $1
            AND wall_id = $2
            AND membership_id = $3
        `,
        [context.tenantId, wallId, membershipId],
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'ETHICAL_WALL_MEMBERSHIP_CHANGED',
          targetType: 'ethical_wall',
          targetId: wallId,
          matterId: wall.matter_id,
          metadata: {
            wall_id: wallId,
            member_user_id: before.props.subjectId,
            matter_id: wall.matter_id,
            before_ref: `wall_membership:${before.props.subjectId}:${before.props.membershipType}`,
          },
        },
        tx,
      );
      await this.permissionEvents.recordPermissionChanged(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          targetType: 'ethical_wall',
          targetId: wallId,
          matterId: wall.matter_id,
          beforeRef: `wall_membership:${before.props.subjectId}:${before.props.membershipType}`,
          afterRef: 'none',
          reasonCode: 'ethical_wall_membership_removed',
          memberUserId: before.props.subjectId,
          wallId,
        },
        tx,
      );
    });
  }

  async requestBreakGlassOverride(actorUserId: string, wallId: string): Promise<never> {
    if (!isUuid(wallId)) throw validationFailed();
    const context = this.tenantContext.require();
    const wall = await this.findWallById(context.tenantId, wallId);

    await this.auditService.log({
      tenantId: context.tenantId,
      actorId: actorUserId,
      action: 'ACCESS_DENIED',
      targetType: 'ethical_wall',
      targetId: wallId,
      matterId: wall?.matter_id ?? null,
      result: 'denied',
      metadata: {
        scope_type: 'break_glass_attempt',
        scope_id: wallId,
        reason_code: 'dual_approval_required',
        wall_id: wallId,
        ...(wall ? { matter_id: wall.matter_id } : {}),
      },
    });

    throw permissionDenied('DUAL_APPROVAL_REQUIRED');
  }

  async isUserExcludedFromMatter(
    tenantId: TenantId,
    matterId: string,
    userId: string,
    queryClient: QueryClient = getPool(),
  ): Promise<boolean> {
    const result = await queryClient.query(
      `
        SELECT 1
        FROM ethical_walls ew
        JOIN ethical_wall_memberships ewm
          ON ewm.tenant_id = ew.tenant_id
         AND ewm.wall_id = ew.wall_id
        WHERE ew.tenant_id = $1
          AND ew.matter_id = $2
          AND ew.status = 'active'
          AND ewm.subject_type = 'user'
          AND ewm.subject_id = $3
          AND ewm.membership_type = 'excluded'
        LIMIT 1
      `,
      [tenantId, matterId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private assertSupportedMembers(members: readonly CreateEthicalWallMemberDto[]): void {
    const seen = new Set<string>();
    for (const member of members) {
      if (member.subjectType !== 'user') throw validationFailed();
      const key = `${member.subjectType}:${member.subjectId}`;
      if (seen.has(key)) throw validationFailed();
      seen.add(key);
    }
  }

  private async assertMatterExists(tenantId: TenantId, matterId: string): Promise<void> {
    const tenantResult = await getPool().query(
      'SELECT 1 FROM matters WHERE tenant_id = $1 AND matter_id = $2 LIMIT 1',
      [tenantId, matterId],
    );
    if ((tenantResult.rowCount ?? 0) > 0) return;
    const anyTenantResult = await getPool().query(
      'SELECT 1 FROM matters WHERE matter_id = $1 LIMIT 1',
      [matterId],
    );
    if ((anyTenantResult.rowCount ?? 0) > 0) throw notFoundDenied();
    throw validationFailed();
  }

  protected async findWallById(tenantId: TenantId, wallId: string): Promise<EthicalWallRow | null> {
    const result = await getPool().query(
      `
        SELECT wall_id, tenant_id, matter_id, wall_name, reason, status, created_by,
          created_at, released_by, released_at
        FROM ethical_walls
        WHERE tenant_id = $1
          AND wall_id = $2
        LIMIT 1
      `,
      [tenantId, wallId],
    );
    return (result.rows[0] as EthicalWallRow | undefined) ?? null;
  }

  private async findWalls(
    tenantId: TenantId,
    query: ListEthicalWallsQueryDto,
  ): Promise<EthicalWallRow[]> {
    const result = await getPool().query(
      `
        SELECT wall_id, tenant_id, matter_id, wall_name, reason, status, created_by,
          created_at, released_by, released_at
        FROM ethical_walls
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR matter_id = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC, wall_id DESC
        LIMIT $4
      `,
      [tenantId, query.matterId ?? null, query.status ?? null, query.limit],
    );
    return result.rows as EthicalWallRow[];
  }

  private async findMembershipsForWalls(
    tenantId: TenantId,
    wallIds: readonly string[],
  ): Promise<WallMembershipEntity[]> {
    if (wallIds.length === 0) return [];
    const result = await getPool().query(
      `
        SELECT membership_id, wall_id, tenant_id, subject_type, subject_id,
          membership_type, created_by, created_at
        FROM ethical_wall_memberships
        WHERE tenant_id = $1
          AND wall_id = ANY($2::uuid[])
        ORDER BY created_at ASC, membership_id ASC
      `,
      [tenantId, wallIds],
    );
    return (result.rows as WallMembershipRow[]).map(mapMembership);
  }

  private async findMembershipById(
    tenantId: TenantId,
    wallId: string,
    membershipId: string,
  ): Promise<WallMembershipEntity | null> {
    const result = await getPool().query(
      `
        SELECT membership_id, wall_id, tenant_id, subject_type, subject_id,
          membership_type, created_by, created_at
        FROM ethical_wall_memberships
        WHERE tenant_id = $1
          AND wall_id = $2
          AND membership_id = $3
        LIMIT 1
      `,
      [tenantId, wallId, membershipId],
    );
    const row = result.rows[0] as WallMembershipRow | undefined;
    return row ? mapMembership(row) : null;
  }

  private async findMembershipForSubject(
    tenantId: TenantId,
    wallId: string,
    input: AddEthicalWallMembershipDto,
  ): Promise<WallMembershipEntity | null> {
    const result = await getPool().query(
      `
        SELECT membership_id, wall_id, tenant_id, subject_type, subject_id,
          membership_type, created_by, created_at
        FROM ethical_wall_memberships
        WHERE tenant_id = $1
          AND wall_id = $2
          AND subject_type = $3
          AND subject_id = $4
        LIMIT 1
      `,
      [tenantId, wallId, input.subjectType, input.subjectId],
    );
    const row = result.rows[0] as WallMembershipRow | undefined;
    return row ? mapMembership(row) : null;
  }

  private async assertMemberUsersExist(
    tenantId: TenantId,
    members: readonly CreateEthicalWallMemberDto[],
  ): Promise<void> {
    for (const member of members) {
      const result = await getPool().query(
        'SELECT 1 FROM users WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
        [tenantId, member.subjectId],
      );
      if ((result.rowCount ?? 0) === 0) throw validationFailed();
    }
  }

  private async insertWall(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    input: CreateEthicalWallDto,
  ): Promise<EthicalWallEntity> {
    const result = await client.query(
      `
        INSERT INTO ethical_walls (
          tenant_id, matter_id, wall_name, reason, created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING wall_id, tenant_id, matter_id, wall_name, reason, status, created_by,
          created_at, released_by, released_at
      `,
      [tenantId, input.matterId, input.wallName, input.reason, actorUserId],
    );
    const row = result.rows[0] as EthicalWallRow | undefined;
    if (!row) throw new Error('ethical wall insert returned no row');
    return mapWall(row);
  }

  private async insertMemberships(
    client: QueryClient,
    tenantId: TenantId,
    actorUserId: string,
    wallId: string,
    members: readonly CreateEthicalWallMemberDto[],
  ): Promise<WallMembershipEntity[]> {
    const rows: WallMembershipEntity[] = [];
    for (const member of members) {
      const result = await client.query(
        `
          INSERT INTO ethical_wall_memberships (
            tenant_id, wall_id, subject_type, subject_id, membership_type, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING membership_id, wall_id, tenant_id, subject_type, subject_id,
            membership_type, created_by, created_at
        `,
        [
          tenantId,
          wallId,
          member.subjectType,
          member.subjectId,
          member.membershipType,
          actorUserId,
        ],
      );
      const row = result.rows[0] as WallMembershipRow | undefined;
      if (!row) throw new Error('ethical wall membership insert returned no row');
      rows.push(mapMembership(row));
    }
    return rows;
  }
}
