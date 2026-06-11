import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  ClientConfidentialityLevel,
  ClientListDto,
  ClientStatus,
  ClientType,
  CreateClientDto,
  ListClientsQueryDto,
  TenantId,
  UpdateClientDto,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserService } from '../user/user.service';
import { ClientEntity } from './client.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface ClientRow {
  client_id: string;
  tenant_id: string;
  name: string;
  client_type: ClientType;
  confidentiality_level: ClientConfidentialityLevel;
  status: ClientStatus;
  metadata_json: Record<string, string>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ClientListRow extends ClientRow {
  total_count: string;
}

function mapClient(row: ClientRow): ClientEntity {
  return new ClientEntity({
    clientId: row.client_id,
    tenantId: row.tenant_id,
    name: row.name,
    clientType: row.client_type,
    confidentialityLevel: row.confidentiality_level,
    status: row.status,
    metadata: row.metadata_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

function notFoundDenied(): NotFoundException {
  return new NotFoundException({ code: 'PERMISSION_DENIED' });
}

function isClientManagerRole(role: string): boolean {
  return role === 'firm_admin' || role === 'matter_owner';
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function changedKeys(before: ClientEntity, input: UpdateClientDto): string[] {
  const keys: string[] = [];
  if (input.name !== undefined && input.name !== before.props.name) keys.push('name');
  if (input.clientType !== undefined && input.clientType !== before.props.clientType) {
    keys.push('client_type');
  }
  if (
    input.confidentialityLevel !== undefined &&
    input.confidentialityLevel !== before.props.confidentialityLevel
  ) {
    keys.push('confidentiality_level');
  }
  if (input.status !== undefined && input.status !== before.props.status) keys.push('status');
  if (input.metadata !== undefined) keys.push('metadata_json');
  return keys;
}

@Injectable()
export class ClientService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(UserService) private readonly userService: UserService,
  ) {}

  async create(actorUserId: string, input: CreateClientDto) {
    const context = this.tenantContext.require();
    await this.assertClientManager(context.tenantId, actorUserId);

    const client = await this.auditService.transaction(context.tenantId, async (tx) => {
      const created = await this.insertClient(
        tx,
        context.tenantId,
        actorUserId,
        input,
      );
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CLIENT_CREATED',
          targetType: 'client',
          targetId: created.props.clientId,
          metadata: { client_id: created.props.clientId },
        },
        tx,
      );
      return created;
    });

    return client.toDto();
  }

  async get(clientId: string) {
    const context = this.tenantContext.require();
    const client = await this.findByIdForTenant(context.tenantId, clientId);
    if (!client) throw notFoundDenied();
    return client.toDto();
  }

  async list(query: ListClientsQueryDto): Promise<ClientListDto> {
    const context = this.tenantContext.require();
    const { items, totalCount } = await this.listForTenant(context.tenantId, query);
    return {
      items: items.map((client) => client.toDto()),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async update(actorUserId: string, clientId: string, input: UpdateClientDto) {
    const context = this.tenantContext.require();
    await this.assertClientManager(context.tenantId, actorUserId);
    const before = await this.findByIdForTenant(context.tenantId, clientId);
    if (!before) throw notFoundDenied();
    const diffKeys = changedKeys(before, input);
    if (diffKeys.length === 0) return before.toDto();

    const updated = await this.auditService.transaction(context.tenantId, async (tx) => {
      const entity = await this.updateClient(tx, context.tenantId, clientId, input);
      if (!entity) throw notFoundDenied();
      await this.auditService.log(
        {
          tenantId: context.tenantId,
          actorId: actorUserId,
          action: 'CLIENT_UPDATED',
          targetType: 'client',
          targetId: clientId,
          metadata: { client_id: clientId, diff_keys: diffKeys },
        },
        tx,
      );
      return entity;
    });

    return updated.toDto();
  }

  private async assertClientManager(tenantId: TenantId, userId: string) {
    const user = await this.userService.findByTenantAndId(tenantId, userId);
    if (!user || !isClientManagerRole(user.role)) throw permissionDenied();
  }

  private async insertClient(
    client: QueryClient,
    tenantId: TenantId,
    createdBy: string,
    input: CreateClientDto,
  ): Promise<ClientEntity> {
    const result = await client.query(
      `
        INSERT INTO clients (
          tenant_id, name, client_type, confidentiality_level, status, metadata_json, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING client_id, tenant_id, name, client_type, confidentiality_level, status,
          metadata_json, created_by, created_at, updated_at
      `,
      [
        tenantId,
        input.name,
        input.clientType,
        input.confidentialityLevel,
        input.status,
        JSON.stringify(input.metadata ?? {}),
        createdBy,
      ],
    );
    const row = result.rows[0] as ClientRow | undefined;
    if (!row) throw new Error('client insert returned no row');
    return mapClient(row);
  }

  private async findByIdForTenant(
    tenantId: TenantId,
    clientId: string,
    queryClient: QueryClient = getPool(),
  ): Promise<ClientEntity | null> {
    const result = await queryClient.query(
      `
        SELECT client_id, tenant_id, name, client_type, confidentiality_level, status,
          metadata_json, created_by, created_at, updated_at
        FROM clients
        WHERE tenant_id = $1
          AND client_id = $2
      `,
      [tenantId, clientId],
    );
    const row = result.rows[0] as ClientRow | undefined;
    return row ? mapClient(row) : null;
  }

  private async listForTenant(
    tenantId: TenantId,
    query: ListClientsQueryDto,
  ): Promise<{ items: ClientEntity[]; totalCount: number }> {
    const filters = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (query.status) {
      params.push(query.status);
      filters.push(`status = $${params.length}`);
    }
    if (query.clientType) {
      params.push(query.clientType);
      filters.push(`client_type = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${escapeLike(query.q)}%`);
      filters.push(`name ILIKE $${params.length} ESCAPE '\\'`);
    }
    params.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await getPool().query<ClientListRow>(
      `
        SELECT client_id, tenant_id, name, client_type, confidentiality_level, status,
          metadata_json, created_by, created_at, updated_at, count(*) OVER()::text AS total_count
        FROM clients
        WHERE ${filters.join(' AND ')}
        ORDER BY lower(name), client_id
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `,
      params,
    );
    return {
      items: result.rows.map(mapClient),
      totalCount: Number(result.rows[0]?.total_count ?? '0'),
    };
  }

  private async updateClient(
    client: QueryClient,
    tenantId: TenantId,
    clientId: string,
    input: UpdateClientDto,
  ): Promise<ClientEntity | null> {
    const result = await client.query(
      `
        UPDATE clients
        SET name = COALESCE($3, name),
            client_type = COALESCE($4, client_type),
            confidentiality_level = COALESCE($5, confidentiality_level),
            status = COALESCE($6, status),
            metadata_json = COALESCE($7::jsonb, metadata_json),
            updated_at = now()
        WHERE tenant_id = $1
          AND client_id = $2
        RETURNING client_id, tenant_id, name, client_type, confidentiality_level, status,
          metadata_json, created_by, created_at, updated_at
      `,
      [
        tenantId,
        clientId,
        input.name ?? null,
        input.clientType ?? null,
        input.confidentialityLevel ?? null,
        input.status ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    const row = result.rows[0] as ClientRow | undefined;
    return row ? mapClient(row) : null;
  }
}
