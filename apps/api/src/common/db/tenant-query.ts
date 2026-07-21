import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface TenantTransactionExecutor {
  tenantTransaction<T>(
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T>;
}

export async function tenantQuery<T extends QueryResultRow>(
  pool: Pool | TenantTransactionExecutor,
  tenantId: string,
  sql: string,
  params?: readonly unknown[],
): Promise<QueryResult<T>> {
  if ('tenantTransaction' in pool) {
    return pool.tenantTransaction(tenantId, (client) =>
      client.query<T>(sql, params ? [...params] : undefined),
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      tenantId,
    ]);
    const result = await client.query<T>(sql, params ? [...params] : undefined);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
