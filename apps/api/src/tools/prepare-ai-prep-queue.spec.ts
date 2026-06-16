import { describe, expect, it } from 'vitest';
import {
  buildPgBossRuntimeGrantSql,
  parsePrepareAiPrepQueueArgs,
  prepareAiPrepQueue,
} from './prepare-ai-prep-queue';

describe('prepare ai prep queue tool', () => {
  it('requires an explicit runtime role in production', () => {
    expect(() => parsePrepareAiPrepQueueArgs([], { NODE_ENV: 'production' })).toThrow(
      /runtime-role/,
    );
  });

  it('parses bounded prepare options', () => {
    expect(
      parsePrepareAiPrepQueueArgs(
        ['--schema', 'pgboss_lai', '--runtime-role', 'vault_app', '--dry-run'],
        { NODE_ENV: 'production', DATABASE_URL: 'postgres://example' },
      ),
    ).toMatchObject({
      schema: 'pgboss_lai',
      runtimeRole: 'vault_app',
      dryRun: true,
      databaseUrl: 'postgres://example',
    });
  });

  it('rejects unsafe PostgreSQL identifiers', () => {
    expect(() =>
      parsePrepareAiPrepQueueArgs(['--schema', 'pgboss;drop', '--runtime-role', 'vault_app'], {
        NODE_ENV: 'production',
      }),
    ).toThrow(/PostgreSQL identifier/);
    expect(() => buildPgBossRuntimeGrantSql('pgboss', 'vault_app;drop')).toThrow(
      /PostgreSQL identifier/,
    );
  });

  it('builds runtime grants for pg-boss tables, functions, sequences, and types', () => {
    const grants = buildPgBossRuntimeGrantSql('pgboss', 'vault_app');
    expect(grants).toEqual([
      'GRANT USAGE ON SCHEMA "pgboss" TO "vault_app"',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "pgboss" TO "vault_app"',
      'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "pgboss" TO "vault_app"',
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "pgboss" TO "vault_app"',
      expect.stringContaining("GRANT USAGE ON TYPE %I.%I TO %I', 'pgboss'"),
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT USAGE ON TYPES TO "vault_app"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "vault_app"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "vault_app"',
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "pgboss" GRANT EXECUTE ON FUNCTIONS TO "vault_app"',
    ]);
    expect(grants.join('\n')).not.toContain('GRANT USAGE ON ALL TYPES IN SCHEMA');
    expect(grants.join('\n')).toContain("t.typcategory <> 'A'");
  });

  it('returns bounded dry-run output without connecting to the database', async () => {
    await expect(
      prepareAiPrepQueue({
        databaseUrl: 'postgres://unused',
        schema: 'pgboss',
        runtimeRole: 'vault_app',
        dryRun: true,
      }),
    ).resolves.toEqual({
      code: 'AI_PREP_QUEUE_PREPARE_DRY_RUN',
      schema: 'pgboss',
      queues: ['ai.prep.dead', 'ai.prep'],
      runtimeRoleGrant: 'planned',
    });
  });
});
