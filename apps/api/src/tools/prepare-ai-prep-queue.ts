import 'reflect-metadata';
import { Client } from 'pg';
import { aiPrepDeadLetterQueueName, aiPrepQueueName } from '../modules/ai/prep/ai-prep.types';

const defaultDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const postgresIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export interface PrepareAiPrepQueueArgs {
  databaseUrl: string;
  schema: string;
  runtimeRole?: string | undefined;
  dryRun: boolean;
}

export interface PrepareAiPrepQueueResult {
  code: 'AI_PREP_QUEUE_PREPARED' | 'AI_PREP_QUEUE_PREPARE_DRY_RUN';
  schema: string;
  queues: string[];
  runtimeRoleGrant: 'applied' | 'planned' | 'skipped';
}

export function parsePrepareAiPrepQueueArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): PrepareAiPrepQueueArgs {
  const schema = argValue(argv, '--schema') ?? env.PGBOSS_SCHEMA ?? 'pgboss';
  assertPgIdentifier(schema, '--schema');

  const runtimeRole = argValue(argv, '--runtime-role') ?? env.AI_PREP_QUEUE_RUNTIME_DB_ROLE;
  if (runtimeRole) assertPgIdentifier(runtimeRole, '--runtime-role');
  if (env.NODE_ENV === 'production' && !runtimeRole) {
    throw new Error('--runtime-role or AI_PREP_QUEUE_RUNTIME_DB_ROLE is required in production');
  }

  return {
    databaseUrl: argValue(argv, '--database-url') ?? env.DATABASE_URL ?? defaultDatabaseUrl,
    schema,
    runtimeRole,
    dryRun: hasFlag(argv, '--dry-run'),
  };
}

export async function prepareAiPrepQueue(
  args: PrepareAiPrepQueueArgs,
): Promise<PrepareAiPrepQueueResult> {
  const queues = [aiPrepDeadLetterQueueName, aiPrepQueueName];
  if (args.dryRun) {
    return {
      code: 'AI_PREP_QUEUE_PREPARE_DRY_RUN',
      schema: args.schema,
      queues,
      runtimeRoleGrant: args.runtimeRole ? 'planned' : 'skipped',
    };
  }

  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: args.databaseUrl,
    application_name: 'amic-vault-ai-prep-queue-prepare',
    schema: args.schema,
    supervise: false,
    schedule: false,
    migrate: true,
    createSchema: true,
  });

  let started = false;
  try {
    await boss.start();
    started = true;
    await boss.createQueue(aiPrepDeadLetterQueueName, {
      retryLimit: 0,
      retentionSeconds: 7 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
    await boss.createQueue(aiPrepQueueName, {
      retryLimit: 5,
      retryDelay: 2,
      retryBackoff: true,
      deadLetter: aiPrepDeadLetterQueueName,
      retentionSeconds: 14 * 24 * 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
    });
  } finally {
    if (started) await boss.stop({ graceful: false });
  }

  if (args.runtimeRole) {
    await grantPgBossRuntimePrivileges(args.databaseUrl, args.schema, args.runtimeRole);
  }

  return {
    code: 'AI_PREP_QUEUE_PREPARED',
    schema: args.schema,
    queues,
    runtimeRoleGrant: args.runtimeRole ? 'applied' : 'skipped',
  };
}

export function buildPgBossRuntimeGrantSql(schema: string, runtimeRole: string): string[] {
  assertPgIdentifier(schema, 'schema');
  assertPgIdentifier(runtimeRole, 'runtimeRole');
  const schemaSql = quoteIdentifier(schema);
  const roleSql = quoteIdentifier(runtimeRole);
  return [
    `GRANT USAGE ON SCHEMA ${schemaSql} TO ${roleSql}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schemaSql} TO ${roleSql}`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schemaSql} TO ${roleSql}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schemaSql} TO ${roleSql}`,
    pgBossRuntimeTypeGrantBlock(schema, runtimeRole),
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaSql} GRANT USAGE ON TYPES TO ${roleSql}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaSql} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleSql}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaSql} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${roleSql}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaSql} GRANT EXECUTE ON FUNCTIONS TO ${roleSql}`,
  ];
}

function pgBossRuntimeTypeGrantBlock(schema: string, runtimeRole: string): string {
  const schemaLiteral = sqlLiteral(schema);
  const roleLiteral = sqlLiteral(runtimeRole);
  return `
DO $$
DECLARE
  target_type record;
BEGIN
  FOR target_type IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ${schemaLiteral}
      AND t.typtype IN ('b', 'c', 'd', 'e', 'r')
      AND t.typcategory <> 'A'
  LOOP
    -- pg-boss may leave internal/derived types that cannot receive explicit privileges.
    BEGIN
      EXECUTE format('GRANT USAGE ON TYPE %I.%I TO %I', ${schemaLiteral}, target_type.typname, ${roleLiteral});
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$`.trim();
}

async function main(): Promise<void> {
  let args: PrepareAiPrepQueueArgs;
  try {
    args = parsePrepareAiPrepQueueArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  try {
    const result = await prepareAiPrepQueue(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'AI_PREP_QUEUE_PREPARE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

async function grantPgBossRuntimePrivileges(
  databaseUrl: string,
  schema: string,
  runtimeRole: string,
): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const statement of buildPgBossRuntimeGrantSql(schema, runtimeRole)) {
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}

function quoteIdentifier(identifier: string): string {
  assertPgIdentifier(identifier, 'identifier');
  return `"${identifier}"`;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertPgIdentifier(identifier: string, label: string): void {
  if (!postgresIdentifierPattern.test(identifier)) {
    throw new Error(`${label} must be a valid PostgreSQL identifier`);
  }
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

if (require.main === module) {
  void main();
}
