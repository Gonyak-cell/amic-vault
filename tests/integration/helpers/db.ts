import { Client } from 'pg';
import type { PoolClient } from 'pg';
import type { TenantTransactionExecutor } from '../../../apps/api/src/common/db/tenant-query';

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

/** Test-only adapter for services that require the production tenant-transaction contract. */
export function createRuntimeTenantTransactionExecutor(): TenantTransactionExecutor {
  return {
    async tenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
      return withClient(createAppClient(), async (client) => {
        await client.query('BEGIN');
        try {
          await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
          const result = await work(client as unknown as PoolClient);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    },
  };
}

export const tenantAlphaId = '11111111-1111-4111-8111-111111111111';
export const tenantBetaId = '22222222-2222-4222-8222-222222222222';
