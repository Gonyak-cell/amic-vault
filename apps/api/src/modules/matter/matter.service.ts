import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  CreateMatterDto,
  ListMattersQueryDto,
  MatterListDto,
  MatterStatus,
  MatterType,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionEventRecorder } from '../audit/permission-event.recorder';
import { EthicalWallService } from '../ethical-wall/ethical-wall.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { MatterMemberService } from './matter-member.service';
import { MatterEntity } from './matter.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface MatterRow {
  matter_id: string;
  tenant_id: string;
  client_id: string;
  matter_code: string;
  matter_name: string;
  matter_type: MatterType;
  status: MatterStatus;
  opened_at: Date | null;
  closed_at: Date | null;
  lead_lawyer_id: string | null;
  practice_group: string | null;
  metadata_json: Record<string, string>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface MatterListRow extends MatterRow {
  total_count: string;
}

export function canCreateMatterRole(role: string): boolean {
  return role === 'firm_admin' || role === 'matter_owner';
}

export function canReadMatterConservatively(
  role: string,
  actorUserId: string,
  matter: MatterEntity,
): boolean {
  // REPLACED-BY: SEC-MATTPERM-ACCECONT-TUW-004
  return role === 'firm_admin' || matter.props.leadLawyerId === actorUserId;
}

export function shouldRestrictMatterListToLead(role: string): boolean {
  // REPLACED-BY: SEC-MATTPERM-ACCECONT-TUW-005
  return role !== 'firm_admin';
}

function mapMatter(row: MatterRow): MatterEntity {
  return new MatterEntity({
    matterId: row.matter_id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    matterCode: row.matter_code,
    matterName: row.matter_name,
    matterType: row.matter_type,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    leadLawyerId: row.lead_lawyer_id,
    practiceGroup: row.practice_group,
    metadata: row.metadata_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function ethicalWallBlocked(): ForbiddenException {
  return new ForbiddenException({ code: 'ETHICAL_WALL_BLOCKED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class MatterService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionEventRecorder) private readonly permissionEvents: PermissionEventRecorder,
    @Inject(EthicalWallService) private readonly ethicalWallService: EthicalWallService,
    @Inject(MatterMemberService) private readonly matterMemberService: MatterMemberService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async create(actorUserId: string, input: CreateMatterDto) {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || !canCreateMatterRole(actor.role)) throw permissionDenied();

    await this.assertClientUsable(context.tenantId, input.clientId);
    const leadLawyerId = input.leadLawyerId ?? actorUserId;
    await this.assertLeadLawyerUsable(context.tenantId, leadLawyerId);

    const matter = await this.auditService.transaction(context.tenantId, async (tx) => {
      const created = await this.insertMatter(
        tx,
        context.tenantId,
        actorUserId,
        leadLawyerId,
        input,
      );
      await this.matterMemberService.addLeadOwner(
        tx,
        context.tenantId,
        created.props.matterId,
        leadLawyerId,
        actorUserId,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_CREATED',
          targetType: 'matter',
          targetId: created.props.matterId,
          matterId: created.props.matterId,
          metadata: {
            matter_id: created.props.matterId,
            client_id: created.props.clientId,
          },
        },
        tx,
      );
      return created;
    });

    return matter.toDto();
  }

  async get(actorUserId: string, matterId: string) {
    const context = this.tenantContext.require();
    const matter = await this.findByIdForTenant(context.tenantId, matterId);
    if (!matter) throw notFoundDenied();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matter);
    return matter.toDto();
  }

  async list(actorUserId: string, query: ListMattersQueryDto): Promise<MatterListDto> {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor) throw permissionDenied();
    const { items, totalCount } = await this.listForTenant(
      context.tenantId,
      actorUserId,
      actor.role,
      query,
    );
    return {
      items: items.map((matter) => matter.toDto()),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async assertCanReadMatter(
    tenantId: TenantId,
    actorUserId: string,
    matter: MatterEntity,
  ): Promise<void> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    let wallDenied = false;
    try {
      wallDenied = await this.ethicalWallService.isUserExcludedFromMatter(
        tenantId,
        matter.props.matterId,
        actorUserId,
      );
    } catch {
      await this.permissionEvents.recordAccessDenied({
        tenantId,
        actorId: actorUserId,
        targetType: 'matter',
        targetId: matter.props.matterId,
        matterId: matter.props.matterId,
        reasonCode: 'EVAL_FAILURE',
      });
      throw permissionDenied();
    }
    if (wallDenied) {
      await this.permissionEvents.recordAccessDenied({
        tenantId,
        actorId: actorUserId,
        targetType: 'matter',
        targetId: matter.props.matterId,
        matterId: matter.props.matterId,
        reasonCode: 'ETHICAL_WALL_BLOCKED',
      });
      throw ethicalWallBlocked();
    }
    const memberAllowed = await this.matterMemberService.isMember(
      tenantId,
      matter.props.matterId,
      actorUserId,
    );
    if (!actor || (actor.role !== 'firm_admin' && !memberAllowed)) {
      await this.permissionEvents.recordAccessDenied({
        tenantId,
        actorId: actorUserId,
        targetType: 'matter',
        targetId: matter.props.matterId,
        matterId: matter.props.matterId,
        reasonCode: 'PERMISSION_DENIED',
      });
      throw permissionDenied();
    }
  }

  private async assertClientUsable(tenantId: TenantId, clientId: string): Promise<void> {
    if (await this.clientExistsForTenant(tenantId, clientId)) return;
    if (await this.clientExistsAnyTenant(clientId)) throw notFoundDenied();
    throw validationFailed();
  }

  private async assertLeadLawyerUsable(tenantId: TenantId, userId: string): Promise<void> {
    const user = await this.userService.findByTenantAndId(tenantId, userId);
    if (user) return;
    if (await this.userExistsAnyTenant(userId)) throw notFoundDenied();
    throw validationFailed();
  }

  private async clientExistsForTenant(tenantId: TenantId, clientId: string): Promise<boolean> {
    const result = await getPool().query(
      'SELECT 1 FROM clients WHERE tenant_id = $1 AND client_id = $2 LIMIT 1',
      [tenantId, clientId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async clientExistsAnyTenant(clientId: string): Promise<boolean> {
    const result = await getPool().query('SELECT 1 FROM clients WHERE client_id = $1 LIMIT 1', [
      clientId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  private async userExistsAnyTenant(userId: string): Promise<boolean> {
    const result = await getPool().query('SELECT 1 FROM users WHERE user_id = $1 LIMIT 1', [
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  private async insertMatter(
    client: QueryClient,
    tenantId: TenantId,
    createdBy: string,
    leadLawyerId: string,
    input: CreateMatterDto,
  ): Promise<MatterEntity> {
    const result = await client.query(
      `
        INSERT INTO matters (
          tenant_id, client_id, matter_code, matter_name, matter_type, status,
          opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json, created_by
        )
        VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7, $8, $9, $10::jsonb, $11)
        RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json,
          created_by, created_at, updated_at
      `,
      [
        tenantId,
        input.clientId,
        input.matterCode,
        input.matterName,
        input.matterType,
        input.openedAt ?? null,
        input.closedAt ?? null,
        leadLawyerId,
        input.practiceGroup ?? null,
        JSON.stringify(input.metadata ?? {}),
        createdBy,
      ],
    );
    const row = result.rows[0] as MatterRow | undefined;
    if (!row) throw new Error('matter insert returned no row');
    return mapMatter(row);
  }

  private async findByIdForTenant(
    tenantId: TenantId,
    matterId: string,
    queryClient: QueryClient = getPool(),
  ): Promise<MatterEntity | null> {
    const result = await queryClient.query(
      `
        SELECT matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json,
          created_by, created_at, updated_at
        FROM matters
        WHERE tenant_id = $1
          AND matter_id = $2
      `,
      [tenantId, matterId],
    );
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async listForTenant(
    tenantId: TenantId,
    actorUserId: string,
    actorRole: string,
    query: ListMattersQueryDto,
  ): Promise<{ items: MatterEntity[]; totalCount: number }> {
    const filters = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    params.push(actorUserId);
    filters.push(`
      NOT EXISTS (
        SELECT 1
        FROM ethical_walls ew
        JOIN ethical_wall_memberships ewm
          ON ewm.tenant_id = ew.tenant_id
         AND ewm.wall_id = ew.wall_id
        WHERE ew.tenant_id = $1
          AND ew.matter_id = matters.matter_id
          AND ew.status = 'active'
          AND ewm.subject_type = 'user'
          AND ewm.subject_id = $${params.length}::uuid
          AND ewm.membership_type = 'excluded'
      )
    `);
    if (shouldRestrictMatterListToLead(actorRole)) {
      params.push(actorUserId);
      filters.push(`
        EXISTS (
          SELECT 1
          FROM matter_members mm
          WHERE mm.tenant_id = matters.tenant_id
            AND mm.matter_id = matters.matter_id
            AND mm.user_id = $${params.length}::uuid
        )
      `);
    }
    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.matterType) {
      params.push(query.matterType);
      filters.push(`matter_type = $${params.length}`);
    }
    if (query.clientId) {
      params.push(query.clientId);
      filters.push(`client_id = $${params.length}`);
    }

    params.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await getPool().query<MatterListRow>(
      `
        SELECT matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json,
          created_by, created_at, updated_at, count(*) OVER()::text AS total_count
        FROM matters
        WHERE ${filters.join(' AND ')}
        ORDER BY opened_at DESC NULLS LAST, created_at DESC, matter_id
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `,
      params,
    );

    return {
      items: result.rows.map(mapMatter),
      totalCount: Number(result.rows[0]?.total_count ?? '0'),
    };
  }
}
