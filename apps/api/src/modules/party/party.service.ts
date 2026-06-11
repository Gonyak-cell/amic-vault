import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  CreatePartyDto,
  ListPartiesQueryDto,
  PartyListDto,
  PartyRole,
  PartyType,
  PermissionDecision,
  TenantId,
  UpdatePartyDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { PartyEntity } from './party.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface PartyRow {
  party_id: string;
  tenant_id: TenantId;
  matter_id: string;
  name: string;
  party_type: PartyType;
  party_role: PartyRole;
  related_client_id: string | null;
  is_restricted: boolean;
  created_by: string;
  created_at: Date;
}

interface MatterStatusRow {
  status: string;
}

const mutationBlockedMatterStatuses = new Set([
  'closed',
  'archived',
  'disposal_review',
  'disposed',
]);

function mapParty(row: PartyRow): PartyEntity {
  return new PartyEntity({
    partyId: row.party_id,
    tenantId: row.tenant_id,
    matterId: row.matter_id,
    name: row.name,
    partyType: row.party_type,
    partyRole: row.party_role,
    relatedClientId: row.related_client_id,
    isRestricted: row.is_restricted,
    createdBy: row.created_by,
    createdAt: row.created_at,
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

function throwReadDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw notFoundDenied();
}

function throwWriteDenied(decision: PermissionDecision): never {
  if (decision.reasonCode === 'ETHICAL_WALL_BLOCKED') throw ethicalWallBlocked();
  throw permissionDenied();
}

@Injectable()
export class PartyService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PermissionService) private readonly permissionService: PermissionService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async create(actorUserId: string, matterId: string, input: CreatePartyDto) {
    const context = this.tenantContext.require();
    await this.assertCanEditMatter(context.tenantId, actorUserId, matterId);
    await this.assertMatterMutable(context.tenantId, matterId);
    await this.assertRelatedClientUsable(context.tenantId, input.relatedClientId ?? null);

    const party = await this.auditService.transaction(context.tenantId, async (tx) => {
      const created = await this.insertParty(tx, context.tenantId, actorUserId, matterId, input);
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'PARTY_ADDED',
          targetType: 'party',
          targetId: created.props.partyId,
          matterId,
          metadata: {
            party_id: created.props.partyId,
            matter_id: matterId,
            ...(created.props.relatedClientId ? { client_id: created.props.relatedClientId } : {}),
          },
        },
        tx,
      );
      return created;
    });

    return party.toDto();
  }

  async list(
    actorUserId: string,
    matterId: string,
    query: ListPartiesQueryDto,
  ): Promise<PartyListDto> {
    const context = this.tenantContext.require();
    await this.assertCanReadMatter(context.tenantId, actorUserId, matterId);
    const parties = await this.listForMatter(context.tenantId, matterId, query);
    return { items: parties.map((party) => party.toDto()) };
  }

  async update(actorUserId: string, partyId: string, input: UpdatePartyDto) {
    const context = this.tenantContext.require();
    const before = await this.findByIdForTenant(context.tenantId, partyId);
    if (!before) throw notFoundDenied();
    await this.assertCanRestrictParty(context.tenantId, actorUserId, before.props.matterId);
    if (before.props.isRestricted === input.isRestricted) return before.toDto();

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const entity = await this.updateRestricted(tx, context.tenantId, partyId, input.isRestricted);
      if (!entity) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'PARTY_RESTRICTED_MARKED',
          targetType: 'party',
          targetId: partyId,
          matterId: before.props.matterId,
          metadata: {
            party_id: partyId,
            matter_id: before.props.matterId,
            before_ref: `restricted:${before.props.isRestricted}`,
            after_ref: `restricted:${input.isRestricted}`,
          },
        },
        tx,
      );
      return entity;
    });

    return updated.toDto();
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

  private async assertCanRestrictParty(
    tenantId: TenantId,
    actorUserId: string,
    matterId: string,
  ): Promise<void> {
    const actor = await this.userService.findByTenantAndId(tenantId, actorUserId);
    if (!actor || actor.status !== 'active') throw permissionDenied();
    if (actor.role === 'security_admin') return;
    const decision = await this.permissionService.canManageMatterMembers(
      { tenantId, userId: actorUserId },
      matterId,
    );
    if (decision.effect !== 'ALLOW') throwWriteDenied(decision);
  }

  private async assertMatterMutable(tenantId: TenantId, matterId: string): Promise<void> {
    const result = await getPool().query<MatterStatusRow>(
      'SELECT status FROM matters WHERE tenant_id = $1 AND matter_id = $2 LIMIT 1',
      [tenantId, matterId],
    );
    const status = result.rows[0]?.status;
    if (!status) throw notFoundDenied();
    if (mutationBlockedMatterStatuses.has(status)) throw validationFailed('MATTER_CLOSED');
  }

  private async assertRelatedClientUsable(
    tenantId: TenantId,
    clientId: string | null,
  ): Promise<void> {
    if (!clientId) return;
    if (await this.clientExistsForTenant(tenantId, clientId)) return;
    if (await this.clientExistsAnyTenant(clientId)) throw notFoundDenied();
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

  private async insertParty(
    tx: QueryClient,
    tenantId: TenantId,
    createdBy: string,
    matterId: string,
    input: CreatePartyDto,
  ): Promise<PartyEntity> {
    const result = await tx.query(
      `
        INSERT INTO parties (
          tenant_id, matter_id, name, party_type, party_role, related_client_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING party_id, tenant_id, matter_id, name, party_type, party_role,
          related_client_id, is_restricted, created_by, created_at
      `,
      [
        tenantId,
        matterId,
        input.name,
        input.partyType,
        input.partyRole,
        input.relatedClientId ?? null,
        createdBy,
      ],
    );
    const row = result.rows[0] as PartyRow | undefined;
    if (!row) throw new Error('party insert returned no row');
    return mapParty(row);
  }

  private async listForMatter(
    tenantId: TenantId,
    matterId: string,
    query: ListPartiesQueryDto,
  ): Promise<PartyEntity[]> {
    const filters = ['tenant_id = $1', 'matter_id = $2'];
    const params: unknown[] = [tenantId, matterId];
    if (query.partyType) {
      params.push(query.partyType);
      filters.push(`party_type = $${params.length}`);
    }
    if (query.partyRole) {
      params.push(query.partyRole);
      filters.push(`party_role = $${params.length}`);
    }
    if (query.isRestricted !== undefined) {
      params.push(query.isRestricted);
      filters.push(`is_restricted = $${params.length}`);
    }

    const result = await getPool().query<PartyRow>(
      `
        SELECT party_id, tenant_id, matter_id, name, party_type, party_role,
          related_client_id, is_restricted, created_by, created_at
        FROM parties
        WHERE ${filters.join(' AND ')}
        ORDER BY created_at ASC, party_id ASC
      `,
      params,
    );
    return result.rows.map(mapParty);
  }

  private async findByIdForTenant(
    tenantId: TenantId,
    partyId: string,
    queryClient: QueryClient = getPool(),
  ): Promise<PartyEntity | null> {
    const result = await queryClient.query(
      `
        SELECT party_id, tenant_id, matter_id, name, party_type, party_role,
          related_client_id, is_restricted, created_by, created_at
        FROM parties
        WHERE tenant_id = $1
          AND party_id = $2
      `,
      [tenantId, partyId],
    );
    const row = result.rows[0] as PartyRow | undefined;
    return row ? mapParty(row) : null;
  }

  private async updateRestricted(
    tx: QueryClient,
    tenantId: TenantId,
    partyId: string,
    isRestricted: boolean,
  ): Promise<PartyEntity | null> {
    const result = await tx.query(
      `
        UPDATE parties
        SET is_restricted = $3
        WHERE tenant_id = $1
          AND party_id = $2
        RETURNING party_id, tenant_id, matter_id, name, party_type, party_role,
          related_client_id, is_restricted, created_by, created_at
      `,
      [tenantId, partyId, isRestricted],
    );
    const row = result.rows[0] as PartyRow | undefined;
    return row ? mapParty(row) : null;
  }
}
