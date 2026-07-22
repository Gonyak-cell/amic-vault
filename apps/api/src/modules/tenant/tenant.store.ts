import { Inject, Injectable } from '@nestjs/common';
import type { TenantId, TenantStatus } from '@amic-vault/shared';
import { DatabaseService, type TenantRegistryRecord } from '../../common/db/database.service';
import type { TenantEntity } from './tenant.entity';
import type { WorkspaceEntity } from './workspace.entity';

interface WorkspaceRow {
  workspace_id: string;
  tenant_id: string;
  name: string;
  status: WorkspaceEntity['status'];
  created_at: Date;
  updated_at: Date;
}

function mapTenant(row: TenantRegistryRecord): TenantEntity {
  return {
    tenantId: row.tenantId as TenantId,
    name: row.name,
    slug: row.slug,
    region: row.region,
    dataResidency: row.dataResidency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkspace(row: WorkspaceRow): WorkspaceEntity {
  return {
    workspaceId: row.workspace_id,
    tenantId: row.tenant_id as TenantId,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TenantStore {
  findTenantById(tenantId: string): Promise<TenantEntity | null>;
  findTenantBySlug(slug: string): Promise<TenantEntity | null>;
  listTenantsByStatus(status?: TenantStatus): Promise<TenantEntity[]>;
  listWorkspacesByTenant(tenantId: TenantId): Promise<WorkspaceEntity[]>;
  findWorkspaceByIdForTenant(
    tenantId: TenantId,
    workspaceId: string,
  ): Promise<WorkspaceEntity | null>;
}

@Injectable()
export class PgTenantStore implements TenantStore {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async findTenantById(tenantId: string): Promise<TenantEntity | null> {
    const row = await this.databaseService.findTenantRegistryById(tenantId);
    return row ? mapTenant(row) : null;
  }

  async findTenantBySlug(slug: string): Promise<TenantEntity | null> {
    const row = await this.databaseService.findTenantRegistryBySlug(slug);
    return row ? mapTenant(row) : null;
  }

  async listTenantsByStatus(status?: TenantStatus): Promise<TenantEntity[]> {
    return (await this.databaseService.listTenantRegistryByStatus(status)).map(mapTenant);
  }

  async listWorkspacesByTenant(tenantId: TenantId): Promise<WorkspaceEntity[]> {
    return this.databaseService.tenantTransaction(tenantId, async (client) => {
      const result = await client.query<WorkspaceRow>(
        `
        SELECT workspace_id, tenant_id, name, status, created_at, updated_at
        FROM workspaces
        WHERE tenant_id = $1
        ORDER BY name
      `,
        [tenantId],
      );
      return result.rows.map(mapWorkspace);
    });
  }

  async findWorkspaceByIdForTenant(
    tenantId: TenantId,
    workspaceId: string,
  ): Promise<WorkspaceEntity | null> {
    return this.databaseService.tenantTransaction(tenantId, async (client) => {
      const result = await client.query<WorkspaceRow>(
        `
        SELECT workspace_id, tenant_id, name, status, created_at, updated_at
        FROM workspaces
        WHERE tenant_id = $1
          AND workspace_id = $2
      `,
        [tenantId, workspaceId],
      );
      const row = result.rows[0];
      return row ? mapWorkspace(row) : null;
    });
  }
}

export const TENANT_STORE = Symbol('TENANT_STORE');
