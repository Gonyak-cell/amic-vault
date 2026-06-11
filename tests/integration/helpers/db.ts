import { Client } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const appDatabaseUrl =
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

export const tenantAlphaId = '11111111-1111-4111-8111-111111111111';
export const tenantBetaId = '22222222-2222-4222-8222-222222222222';
