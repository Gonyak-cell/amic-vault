import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
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

  private assertPoolAvailable(): void {
    if (this.poolFailed || this.closePromise) {
      throw denied();
    }
  }
}
