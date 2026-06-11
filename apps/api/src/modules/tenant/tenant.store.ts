import { Pool } from 'pg';
import type { TenantId, TenantStatus } from '@amic-vault/shared';
import type { TenantEntity } from './tenant.entity';
import type { WorkspaceEntity } from './workspace.entity';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

interface TenantRow {
  tenant_id: string;
  name: string;
  slug: string;
  region: string;
  data_residency: string;
  status: TenantStatus;
  created_at: Date;
  updated_at: Date;
}

interface WorkspaceRow {
  workspace_id: string;
  tenant_id: string;
  name: string;
  status: WorkspaceEntity['status'];
  created_at: Date;
  updated_at: Date;
}

function mapTenant(row: TenantRow): TenantEntity {
  return {
    tenantId: row.tenant_id as TenantId,
    name: row.name,
    slug: row.slug,
    region: row.region,
    dataResidency: row.data_residency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export class PgTenantStore implements TenantStore {
  async findTenantById(tenantId: string): Promise<TenantEntity | null> {
    const result = await getPool().query<TenantRow>(
      `
        SELECT tenant_id, name, slug, region, data_residency, status, created_at, updated_at
        FROM tenants
        WHERE tenant_id = $1
      `,
      [tenantId],
    );
    const row = result.rows[0];
    return row ? mapTenant(row) : null;
  }

  async findTenantBySlug(slug: string): Promise<TenantEntity | null> {
    const result = await getPool().query<TenantRow>(
      `
        SELECT tenant_id, name, slug, region, data_residency, status, created_at, updated_at
        FROM tenants
        WHERE slug = $1
      `,
      [slug],
    );
    const row = result.rows[0];
    return row ? mapTenant(row) : null;
  }

  async listTenantsByStatus(status?: TenantStatus): Promise<TenantEntity[]> {
    const result = await getPool().query<TenantRow>(
      `
        SELECT tenant_id, name, slug, region, data_residency, status, created_at, updated_at
        FROM tenants
        WHERE $1::text IS NULL OR status = $1
        ORDER BY slug
      `,
      [status ?? null],
    );
    return result.rows.map(mapTenant);
  }

  async listWorkspacesByTenant(tenantId: TenantId): Promise<WorkspaceEntity[]> {
    const result = await getPool().query<WorkspaceRow>(
      `
        SELECT workspace_id, tenant_id, name, status, created_at, updated_at
        FROM workspaces
        WHERE tenant_id = $1
        ORDER BY name
      `,
      [tenantId],
    );
    return result.rows.map(mapWorkspace);
  }

  async findWorkspaceByIdForTenant(
    tenantId: TenantId,
    workspaceId: string,
  ): Promise<WorkspaceEntity | null> {
    const result = await getPool().query<WorkspaceRow>(
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
  }
}

export const TENANT_STORE = Symbol('TENANT_STORE');
