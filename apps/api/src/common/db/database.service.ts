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
  tenant_name: string;
  tenant_slug: string;
  tenant_region: string;
  tenant_data_residency: string;
  tenant_status: string;
  tenant_created_at: Date;
  tenant_updated_at: Date;
  user_id: string;
  user_email: string;
  user_name: string;
  user_role: string;
  user_practice_group: string | null;
  user_password_hash: string;
  user_status: string;
  user_mfa_enabled: boolean;
  user_last_login_at: Date | null;
  user_created_at: Date;
  user_updated_at: Date;
}

export interface ConsumedPasswordResetTokenLookup extends QueryResultRow {
  tenant_id: string;
  user_id: string;
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

function denied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly transactionScope = new AsyncLocalStorage<true>();
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
    if (!tenantId.trim() || this.transactionScope.getStore()) {
      throw denied();
    }
    this.assertPoolAvailable();

    return this.transactionScope.run(true, async () => {
      const client = await this.pool.connect();
      try {
        return await this.tenantAwareDataSource.transactionForTenant(client, tenantId, work);
      } finally {
        client.release();
      }
    });
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

  async findUniqueLoginCandidateByEmail(email: string): Promise<LoginCandidateLookup | undefined> {
    const result = await this.authLookup<LoginCandidateLookup>(
      'SELECT * FROM app_find_unique_login_candidate_by_email($1)',
      [email],
    );
    return result[0];
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.authLookup('SELECT app_revoke_session_by_token_hash($1)', [tokenHash]);
  }

  async consumePasswordResetTokenHash(
    tokenHash: string,
  ): Promise<ConsumedPasswordResetTokenLookup | undefined> {
    const result = await this.authLookup<ConsumedPasswordResetTokenLookup>(
      'SELECT tenant_id, user_id FROM app_consume_password_reset_token_hash($1)',
      [tokenHash],
    );
    return result[0];
  }

  async findTenantRegistryById(tenantId: string): Promise<TenantRegistryRecord | undefined> {
    const rows = await this.readTenantRegistry<TenantRegistryRecord>(
      `
        SELECT tenant_id AS "tenantId", name, slug, region,
          data_residency AS "dataResidency", status, created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tenants
        WHERE tenant_id = $1
        LIMIT 1
      `,
      [tenantId],
    );
    return rows[0];
  }

  async findTenantRegistryBySlug(slug: string): Promise<TenantRegistryRecord | undefined> {
    const rows = await this.readTenantRegistry<TenantRegistryRecord>(
      `
        SELECT tenant_id AS "tenantId", name, slug, region,
          data_residency AS "dataResidency", status, created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tenants
        WHERE slug = $1
        LIMIT 1
      `,
      [slug],
    );
    return rows[0];
  }

  async listTenantRegistryByStatus(status?: TenantStatus): Promise<TenantRegistryRecord[]> {
    return this.readTenantRegistry<TenantRegistryRecord>(
      `
        SELECT tenant_id AS "tenantId", name, slug, region,
          data_residency AS "dataResidency", status, created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tenants
        WHERE $1::text IS NULL OR status = $1
        ORDER BY slug
      `,
      [status ?? null],
    );
  }

  async listActiveTenantRegistryIds(): Promise<string[]> {
    const rows = await this.readTenantRegistry<{ tenantId: string }>(
      `
        SELECT tenant_id::text AS "tenantId"
        FROM tenants
        WHERE status = 'active'
        ORDER BY tenant_id ASC
      `,
    );
    return rows.map((row) => row.tenantId);
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

  /** `tenants` is the sole RLS-exempt registry. This remains private so
   * callers can use only the named registry methods above, never a generic
   * tenant-less runtime query. */
  private async readTenantRegistry<T extends QueryResultRow>(
    statement: string,
    params?: readonly unknown[],
  ): Promise<T[]> {
    this.assertPoolAvailable();
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(statement, params ? [...params] : undefined);
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
