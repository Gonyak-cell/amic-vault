import { Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { isUserRole } from '@amic-vault/shared';
import type { SearchSqlFragment } from '../query/search-filter.builder';
import { DocumentScopeFilter } from './document-scope.filter';
import { MatterScopeFilter } from './matter-scope.filter';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';
import { WallScopeFilter } from './wall-scope.filter';

export interface SearchRequestContext {
  tenantId: string;
  userId: string;
  sessionId?: string | null;
}

export type SearchPermissionScopeDecision =
  | { effect: 'DENY'; reasonCode: 'DENY_ALL' | 'SCOPE_ERROR' }
  | { effect: 'ALLOW'; scope: SearchSqlFragment; appliedRules?: string[] };

export interface SearchPermissionScopeProvider {
  scopeForSearch(ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision>;
}

export const SEARCH_PERMISSION_SCOPE_PROVIDER = Symbol('SEARCH_PERMISSION_SCOPE_PROVIDER');

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

@Injectable()
export class DenyAllSearchPermissionScopeProvider implements SearchPermissionScopeProvider {
  async scopeForSearch(): Promise<SearchPermissionScopeDecision> {
    return { effect: 'DENY', reasonCode: 'DENY_ALL' };
  }
}

@Injectable()
export class PermissionBoundSearchPermissionScopeProvider implements SearchPermissionScopeProvider {
  constructor(
    @Inject(MatterScopeFilter)
    private readonly matterFilter: MatterScopeFilter,
    @Inject(DocumentScopeFilter)
    private readonly documentFilter: DocumentScopeFilter,
    @Inject(WallScopeFilter)
    private readonly wallFilter: WallScopeFilter,
  ) {}

  async scopeForSearch(ctx: SearchRequestContext): Promise<SearchPermissionScopeDecision> {
    const actor = await this.findActor(ctx);
    if (!actor) return { effect: 'DENY', reasonCode: 'SCOPE_ERROR' };

    const fragments = [
      this.matterFilter.build(actor),
      this.documentFilter.build(actor),
      this.wallFilter.build(actor),
    ];
    return {
      effect: 'ALLOW',
      scope: combineFilters(fragments),
      appliedRules: fragments.flatMap((fragment) => fragment.appliedRules),
    };
  }

  private async findActor(ctx: SearchRequestContext): Promise<SearchPermissionActor | null> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        ctx.tenantId,
      ]);
      const result = await selectActor(client, ctx);
      await client.query('COMMIT');
      const row = result.rows[0];
      if (!row || row.status !== 'active' || !isUserRole(row.role)) return null;
      return { tenantId: ctx.tenantId, userId: ctx.userId, role: row.role };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function selectActor(client: PoolClient, ctx: SearchRequestContext) {
  return client.query<{ role: string; status: string }>(
    `
      SELECT role, status
      FROM users
      WHERE tenant_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [ctx.tenantId, ctx.userId],
  );
}

function combineFilters(filters: readonly SearchScopeFilter[]): SearchSqlFragment {
  return {
    sql: filters.map((filter) => `(${filter.sql})`).join('\nAND '),
    params: filters.flatMap((filter) => [...filter.params]),
  };
}
