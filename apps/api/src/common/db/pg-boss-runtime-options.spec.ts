import { describe, expect, it } from 'vitest';
import { pgBossRuntimeOptions } from './pg-boss-runtime-options';

describe('pgBossRuntimeOptions', () => {
  it('disables runtime migrations and schema creation by default in production', () => {
    expect(
      pgBossRuntimeOptions({
        applicationName: 'amic-vault-test',
        env: { NODE_ENV: 'production' },
      }),
    ).toMatchObject({
      application_name: 'amic-vault-test',
      migrate: false,
      createSchema: false,
      supervise: true,
    });
  });

  it('keeps local and test queues self-bootstrapping by default', () => {
    expect(
      pgBossRuntimeOptions({
        applicationName: 'amic-vault-test',
        env: { NODE_ENV: 'test' },
      }),
    ).toMatchObject({
      migrate: true,
      createSchema: true,
    });
  });

  it('allows explicit production overrides for one-off maintenance tasks', () => {
    expect(
      pgBossRuntimeOptions({
        applicationName: 'amic-vault-test',
        migrateEnvName: 'AI_PREP_QUEUE_MIGRATE_ENABLED',
        createSchemaEnvName: 'AI_PREP_QUEUE_CREATE_SCHEMA_ENABLED',
        superviseEnvName: 'AI_PREP_QUEUE_SUPERVISE_ENABLED',
        env: {
          NODE_ENV: 'production',
          PGBOSS_SCHEMA: 'pgboss_lai',
          AI_PREP_QUEUE_MIGRATE_ENABLED: 'true',
          AI_PREP_QUEUE_CREATE_SCHEMA_ENABLED: 'true',
          AI_PREP_QUEUE_SUPERVISE_ENABLED: 'false',
        },
      }),
    ).toMatchObject({
      schema: 'pgboss_lai',
      migrate: true,
      createSchema: true,
      supervise: false,
    });
  });

  it('supports global pg-boss env overrides', () => {
    expect(
      pgBossRuntimeOptions({
        applicationName: 'amic-vault-test',
        env: {
          NODE_ENV: 'production',
          PGBOSS_MIGRATE_ENABLED: '1',
          PGBOSS_CREATE_SCHEMA_ENABLED: '0',
        },
      }),
    ).toMatchObject({
      migrate: true,
      createSchema: false,
    });
  });
});
