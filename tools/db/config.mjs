export const defaultDatabaseUrl =
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

export const defaultAppDatabaseUrl =
  'postgres://vault_app:vault_app_dev_password@localhost:5432/amic_vault';

export function databaseUrl() {
  return process.env.DATABASE_MIGRATION_URL || defaultDatabaseUrl;
}

export function appDatabaseUrl() {
  return process.env.DATABASE_RUNTIME_URL || process.env.APP_DATABASE_URL || defaultAppDatabaseUrl;
}
