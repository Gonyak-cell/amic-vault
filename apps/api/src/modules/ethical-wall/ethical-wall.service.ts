import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  CreateEthicalWallDto,
  CreateEthicalWallMemberDto,
  TenantId,
  WallMembershipType,
  WallSubjectType,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
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

@Injectable()
export class EthicalWallService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
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
      return {
        wall: wall.toDto(),
        memberships: memberships.map((membership) => membership.toDto()),
      };
    });

    return result;
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
