import { Client } from 'pg';

export interface RuntimeRoleRow {
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  owns_protected_table: boolean;
}

export interface RuntimeRoleQueryable {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: RuntimeRoleRow[] }>;
}

const protectedTables = ['audit_events', 'documents', 'file_objects'];

export function configureRuntimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const runtimeUrl = env.DATABASE_RUNTIME_URL?.trim();
  if (!runtimeUrl) throw new Error('DATABASE_RUNTIME_URL_REQUIRED');
  // Direct-pool consumers are migrated in subsequent batches. This bridge is
  // assigned only after the runtime URL is required, never from owner fallback.
  env.DATABASE_URL = runtimeUrl;
  return runtimeUrl;
}

export async function assertRuntimeRole(
  queryable: RuntimeRoleQueryable,
  expectedRole = 'vault_app',
): Promise<void> {
  const result = await queryable.query(
    `
      SELECT current_user,
             role.rolsuper,
             role.rolbypassrls,
             EXISTS (
               SELECT 1
               FROM pg_class relation
               INNER JOIN pg_roles owner ON owner.oid = relation.relowner
               WHERE relation.relkind = 'r'
                 AND relation.relname = ANY($1::text[])
                 AND owner.rolname = current_user
             ) AS owns_protected_table
      FROM pg_roles role
      WHERE role.rolname = current_user
    `,
    [protectedTables],
  );
  const row = result.rows[0];
  if (!row
    || row.current_user !== expectedRole
    || row.rolsuper
    || row.rolbypassrls
    || row.owns_protected_table) {
    throw new Error('RUNTIME_DATABASE_ROLE_INVALID');
  }
}

export async function assertRuntimeDatabaseRole(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const connectionString = configureRuntimeDatabaseUrl(env);
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await assertRuntimeRole(client, env.DATABASE_RUNTIME_ROLE?.trim() || 'vault_app');
  } finally {
    await client.end();
  }
}
