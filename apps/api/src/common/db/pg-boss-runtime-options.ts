import type { ConstructorOptions } from 'pg-boss';

const truthyValues = new Set(['1', 'true', 'yes']);
const falsyValues = new Set(['0', 'false', 'no']);

export interface PgBossRuntimeOptionsInput {
  applicationName: string;
  env?: NodeJS.ProcessEnv;
  migrateEnvName?: string;
  createSchemaEnvName?: string;
  superviseEnvName?: string;
}

export function pgBossRuntimeOptions({
  applicationName,
  env = process.env,
  migrateEnvName,
  createSchemaEnvName,
  superviseEnvName,
}: PgBossRuntimeOptionsInput): Pick<
  ConstructorOptions,
  'application_name' | 'schema' | 'supervise' | 'migrate' | 'createSchema'
> {
  const migrate =
    envBoolean(env, [migrateEnvName, 'PGBOSS_MIGRATE_ENABLED']) ?? env.NODE_ENV !== 'production';
  const options: Pick<
    ConstructorOptions,
    'application_name' | 'schema' | 'supervise' | 'migrate' | 'createSchema'
  > = {
    application_name: applicationName,
    supervise: envBoolean(env, [superviseEnvName, 'PGBOSS_SUPERVISE_ENABLED']) ?? true,
    migrate,
    createSchema:
      envBoolean(env, [createSchemaEnvName, 'PGBOSS_CREATE_SCHEMA_ENABLED']) ?? migrate,
  };
  const schema = pgBossSchema(env);
  if (schema) options.schema = schema;
  return options;
}

export function pgBossSchema(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const schema = env.PGBOSS_SCHEMA?.trim();
  return schema || undefined;
}

function envBoolean(env: NodeJS.ProcessEnv, names: Array<string | undefined>): boolean | undefined {
  for (const name of names) {
    if (!name) continue;
    const raw = env[name];
    if (raw === undefined) continue;
    const normalized = raw.trim().toLowerCase();
    if (truthyValues.has(normalized)) return true;
    if (falsyValues.has(normalized)) return false;
  }
  return undefined;
}
