import { Client, type PoolClient } from 'pg';

const databaseUrl =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const appDatabaseUrl =
  process.env.DATABASE_RUNTIME_URL ??
  process.env.APP_DATABASE_URL ??
  'postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault';

export function createOwnerClient(): Client {
  return new Client({ connectionString: databaseUrl });
}

export function createAppClient(): Client {
  return new Client({ connectionString: appDatabaseUrl });
}

export async function withClient<T>(client: Client, run: (client: Client) => Promise<T>): Promise<T> {
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function setTenant(client: Client, tenantId: string): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant_id', tenantId]);
}

export async function advanceAuthThrottleWindows(): Promise<void> {
  await withClient(createOwnerClient(), (client) =>
    client.query(`
      UPDATE auth_throttle_states
      SET next_allowed_at = clock_timestamp() - interval '1 second'
      WHERE locked_until IS NULL
    `),
  );
}

export interface RuntimeDatabaseExecutor {
  tenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T>;
  auditTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T>;
}

export function createRuntimeDatabaseExecutor(): RuntimeDatabaseExecutor {
  const transaction = async <T>(
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> => {
    return withClient(createAppClient(), async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  };
  return { tenantTransaction: transaction, auditTransaction: transaction };
}

export const tenantAlphaId = '11111111-1111-4111-8111-111111111111';
export const tenantBetaId = '22222222-2222-4222-8222-222222222222';
