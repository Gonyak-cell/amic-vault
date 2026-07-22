import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import type { TenantStatus } from '@amic-vault/shared';
import { DATABASE_POOL } from './database.tokens';
import { TenantAwareDataSource } from './tenant-aware-datasource';

export interface DatabasePool {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface ActiveSessionLookup extends QueryResultRow {
  session_id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  mfa_verified: boolean;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface LoginCandidateLookup extends QueryResultRow {
  tenant_id: string;
  user_id: string;
  user_email: string;
  user_password_hash: string;
  user_status: string;
  tenant_status: string;
}

export interface TenantRegistryRecord extends QueryResultRow {
  tenantId: string;
  name: string;
  slug: string;
  region: string;
  dataResidency: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantTransactionScope {
  client: PoolClient;
  tenantId: string;
}

function denied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly transactionScope = new AsyncLocalStorage<TenantTransactionScope | undefined>();
  private readonly logger = new Logger(DatabaseService.name);
  private closePromise: Promise<void> | undefined;
  private poolFailed = false;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    @Inject(TenantAwareDataSource)
    private readonly tenantAwareDataSource: TenantAwareDataSource,
  ) {
    this.pool.on('error', () => {
      this.poolFailed = true;
      this.logger.warn('DATABASE_POOL_ERROR');
    });
  }

  async tenantTransaction<T>(
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!tenantId.trim()) throw denied();
    const activeScope = this.transactionScope.getStore();
    if (activeScope) {
      if (activeScope.tenantId !== tenantId) throw denied();
      return work(activeScope.client);
    }
    this.assertPoolAvailable();

    const client = await this.pool.connect();
    try {
      return await this.transactionScope.run({ tenantId, client }, () =>
        this.tenantAwareDataSource.transactionForTenant(client, tenantId, work),
      );
    } finally {
      client.release();
    }
  }

  async auditTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transactionScope.run(undefined, () => this.tenantTransaction(tenantId, work));
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<ActiveSessionLookup | undefined> {
    const result = await this.authLookup<ActiveSessionLookup>(
      'SELECT * FROM app_find_active_session_by_token_hash($1)',
      [tokenHash],
    );
    return result[0];
  }

  async findLoginCandidateByAccountLedgerId(
    accountLedgerId: string,
  ): Promise<LoginCandidateLookup | undefined> {
    const result = await this.authLookup<LoginCandidateLookup>(
      'SELECT * FROM app_find_login_candidate_by_account_ledger_id($1)',
      [accountLedgerId],
    );
    return result[0];
  }

  async findTenantRegistryById(tenantId: string): Promise<TenantRegistryRecord | undefined> {
    return (await this.readTenantRegistry('WHERE tenant_id = $1', [tenantId]))[0];
  }

  async findTenantRegistryBySlug(slug: string): Promise<TenantRegistryRecord | undefined> {
    return (await this.readTenantRegistry('WHERE slug = $1', [slug]))[0];
  }

  async listTenantRegistryByStatus(status?: TenantStatus): Promise<TenantRegistryRecord[]> {
    return this.readTenantRegistry('WHERE $1::text IS NULL OR status = $1 ORDER BY slug', [status ?? null]);
  }

  async listActiveTenantRegistryIds(): Promise<string[]> {
    const rows = await this.readTenantRegistry<{ tenant_id: string }>(
      "WHERE status = 'active' ORDER BY tenant_id ASC",
    );
    return rows.map((row) => row.tenant_id);
  }

  async onModuleDestroy(): Promise<void> {
    this.closePromise ??= this.pool.end();
    await this.closePromise;
  }

  private async authLookup<T extends QueryResultRow>(
    statement: string,
    params: string[],
  ): Promise<T[]> {
    this.assertPoolAvailable();
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(statement, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  private async readTenantRegistry<T extends QueryResultRow = TenantRegistryRecord>(
    whereClause: string,
    params?: readonly unknown[],
  ): Promise<T[]> {
    this.assertPoolAvailable();
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(
        `SELECT tenant_id AS "tenantId", name, slug, region,
          data_residency AS "dataResidency", status, created_at AS "createdAt",
          updated_at AS "updatedAt"
         FROM tenants ${whereClause}`,
        params ? [...params] : undefined,
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  private assertPoolAvailable(): void {
    if (this.poolFailed || this.closePromise) {
      throw denied();
    }
  }
}
