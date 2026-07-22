import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import type { TenantStatus, UserRole, UserStatus } from '@amic-vault/shared';
import { DATABASE_POOL } from './database.tokens';
import { pgBossSchema } from './pg-boss-runtime-options';
import { TenantAwareDataSource, type TenantTransactionOptions } from './tenant-aware-datasource';

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
  tenant_created_at: Date;
  tenant_updated_at: Date;
  user_id: string;
  user_email: string;
  user_name: string;
  user_role: UserRole;
  user_practice_group: string | null;
  user_mfa_enabled: boolean;
  user_last_login_at: Date | null;
  user_created_at: Date;
  user_updated_at: Date;
  user_password_hash: string;
  user_status: UserStatus;
  tenant_status: TenantStatus;
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

/** Capability-token lookup is the sole tenant-resolution exception. */
export interface ExternalLinkTokenLookup extends QueryResultRow {
  link_id: string;
  tenant_id: string;
  workspace_id: string;
  external_user_id: string;
  document_id: string;
  version_id: string | null;
  status: string;
  expires_at: Date;
  nda_required: boolean;
  watermark_required: boolean;
  dlp_warning_status: string;
  dlp_result_hash: string | null;
  dlp_finding_count: number;
  dlp_override_reason_code: string | null;
  created_at: Date;
  updated_at: Date;
  matter_id: string;
  workspace_status: string;
  external_user_status: string;
  membership_status: string;
  document_status: string;
  document_legal_hold: boolean;
  matter_legal_hold: boolean;
}

export interface PgBossQueueMetricLookup extends QueryResultRow {
  queue: string;
  depth: string;
  dead_letter_count: string;
}

interface ExistsLookup extends QueryResultRow {
  exists: boolean;
}

interface TenantTransactionScope {
  client: PoolClient;
  tenantId: string;
  isolationLevel: TenantTransactionOptions['isolationLevel'];
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
    options: TenantTransactionOptions = {},
  ): Promise<T> {
    if (!tenantId.trim()) throw denied();
    const activeScope = this.transactionScope.getStore();
    if (activeScope) {
      if (activeScope.tenantId !== tenantId) throw denied();
      if (options.isolationLevel === 'repeatable read' && activeScope.isolationLevel !== 'repeatable read') {
        throw denied();
      }
      return work(activeScope.client);
    }
    this.assertPoolAvailable();

    const client = await this.pool.connect();
    try {
      return await this.transactionScope.run({ tenantId, client, isolationLevel: options.isolationLevel }, () =>
        this.tenantAwareDataSource.transactionForTenant(client, tenantId, work, options),
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

  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.authLookup('SELECT app_revoke_session_by_token_hash($1)', [tokenHash]);
  }

  async consumePasswordResetTokenHash(
    tokenHash: string,
  ): Promise<{ tenant_id: string; user_id: string } | undefined> {
    const result = await this.authLookup<{ tenant_id: string; user_id: string }>(
      'SELECT tenant_id, user_id FROM app_consume_password_reset_token_hash($1)',
      [tokenHash],
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

  async findLoginCandidateByAccountLedgerId(
    accountLedgerId: string,
  ): Promise<LoginCandidateLookup | undefined> {
    const result = await this.authLookup<LoginCandidateLookup>(
      'SELECT * FROM app_find_login_candidate_by_account_ledger_id($1)',
      [accountLedgerId],
    );
    return result[0];
  }

  async clientExistsAnyTenant(clientId: string): Promise<boolean> {
    const result = await this.authLookup<ExistsLookup>(
      'SELECT app_client_exists_any_tenant($1) AS exists',
      [clientId],
    );
    return result[0]?.exists === true;
  }

  async findExternalLinkByTokenHash(
    tokenHash: string,
  ): Promise<ExternalLinkTokenLookup | undefined> {
    const result = await this.authLookup<ExternalLinkTokenLookup>(
      'SELECT * FROM app_find_external_link_by_token_hash($1)',
      [tokenHash],
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

  /** Returns aggregate operational queue counts only, never job payloads. */
  async readPgBossQueueMetrics(
    definitions: readonly { queue: string; mainQueue: string; deadLetterQueue: string }[],
  ): Promise<PgBossQueueMetricLookup[]> {
    const schema = pgBossSchema() ?? 'pgboss';
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema)) throw denied();
    this.assertPoolAvailable();
    const client = await this.pool.connect();
    try {
      const result = await client.query<PgBossQueueMetricLookup>(
        `
          WITH queue_defs(metric_queue, main_queue, dead_queue) AS (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
          )
          SELECT q.metric_queue AS queue,
            count(*) FILTER (
              WHERE j.name = q.main_queue
                AND j.state IN ('created', 'retry', 'active')
            )::text AS depth,
            count(*) FILTER (
              WHERE j.name = q.dead_queue
                AND j.state IN ('created', 'retry', 'active', 'failed')
            )::text AS dead_letter_count
          FROM queue_defs q
          LEFT JOIN ${quotePgIdentifier(schema)}.${quotePgIdentifier('job')} j
            ON j.name IN (q.main_queue, q.dead_queue)
          GROUP BY q.metric_queue
          ORDER BY q.metric_queue ASC
        `,
        [
          definitions.map((definition) => definition.queue),
          definitions.map((definition) => definition.mainQueue),
          definitions.map((definition) => definition.deadLetterQueue),
        ],
      );
      return result.rows;
    } finally {
      client.release();
    }
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

function quotePgIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
