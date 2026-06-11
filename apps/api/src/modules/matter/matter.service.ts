import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MatterState,
  isMatterState,
  validateMatterTransition,
  type MatterStateValue,
} from '@amic-vault/domain';
import { Pool } from 'pg';
import type {
  CreateMatterDto,
  ListMattersQueryDto,
  MatterListDto,
  MatterStatus,
  MatterType,
  PermissionDecision,
  TenantId,
  UserRole,
} from '@amic-vault/shared';
import { isUserRole } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import type { UpdateMatterStatusDto } from './dto/update-matter-status.dto';
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

function validationFailed(reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    ...(reason ? { reason } : {}),
  });
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
    @Inject(MatterMemberService) private readonly matterMemberService: MatterMemberService,
    @Inject(PermissionQueryBuilder) private readonly permissionQueryBuilder: PermissionQueryBuilder,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
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
    await this.assertCanReadMatter(context.tenantId, actorUserId, matter.props.matterId);
    return matter.toDto();
  }

  async updateStatus(actorUserId: string, matterId: string, input: UpdateMatterStatusDto) {
    const context = this.tenantContext.require();
    const before = await this.findByIdForTenant(context.tenantId, matterId);
    if (!before) throw notFoundDenied();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);

    const from = asMatterState(before.props.status);
    const to = asMatterState(input.status);
    const transition = validateMatterTransition(from, to);
    if (!transition.allowed) throw validationFailed(transition.reasonCode);
    if (from === MatterState.Closing && to === MatterState.Closed && before.props.closedAt) {
      throw validationFailed('MATTER_CLOSED');
    }

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const changed = await this.updateMatterStatus(tx, context.tenantId, matterId, to);
      if (!changed) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'MATTER_STATUS_CHANGED',
          targetType: 'matter',
          targetId: matterId,
          matterId,
          metadata: {
            matter_id: matterId,
            before_ref: `status:${from}`,
            after_ref: `status:${to}`,
            reason_code: 'matter_status_changed',
          },
        },
        tx,
      );
      return changed;
    });

    return updated.toDto();
  }

  async list(actorUserId: string, query: ListMattersQueryDto): Promise<MatterListDto> {
    const context = this.tenantContext.require();
    const actor = await this.userService.findByTenantAndId(context.tenantId, actorUserId);
    if (!actor || !isUserRole(actor.role)) throw permissionDenied();
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
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canReadMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwReadDenied(decision);
  }

  private async assertCanEditMatter(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const decision = await this.permissionService.canEditMatter(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
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

  private async updateMatterStatus(
    client: QueryClient,
    tenantId: TenantId,
    matterId: string,
    status: MatterStateValue,
  ): Promise<MatterEntity | null> {
    const result = await client.query(
      `
        UPDATE matters
        SET status = $3,
            opened_at = CASE
              WHEN $3 = 'open' AND opened_at IS NULL THEN now()
              ELSE opened_at
            END,
            closed_at = CASE
              WHEN $3 = 'closed' THEN COALESCE(closed_at, now())
              ELSE closed_at
            END,
            updated_at = now()
        WHERE tenant_id = $1
          AND matter_id = $2
        RETURNING matter_id, tenant_id, client_id, matter_code, matter_name, matter_type,
          status, opened_at, closed_at, lead_lawyer_id, practice_group, metadata_json,
          created_by, created_at, updated_at
      `,
      [tenantId, matterId, status],
    );
    const row = result.rows[0] as MatterRow | undefined;
    return row ? mapMatter(row) : null;
  }

  private async listForTenant(
    tenantId: TenantId,
    actorUserId: string,
    actorRole: UserRole,
    query: ListMattersQueryDto,
  ): Promise<{ items: MatterEntity[]; totalCount: number }> {
    const filters = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    const permissionFilter = this.permissionQueryBuilder.buildMatterFilter(
      { tenantId, userId: actorUserId, role: actorRole },
      params.length + 1,
      'matters',
    );
    filters.push(permissionFilter.sql);
    params.push(...permissionFilter.params);
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

function asMatterState(status: string): MatterStateValue {
  if (isMatterState(status)) return status;
  throw validationFailed();
}

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw permissionDenied();
}
