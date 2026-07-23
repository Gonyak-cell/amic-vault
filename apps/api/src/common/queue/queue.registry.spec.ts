import { describe, expect, it, vi } from 'vitest';
import type { ConstructorOptions, PgBoss } from 'pg-boss';
import {
  QueueRegistry,
  assertRuntimeQueueOptions,
  queueRegistryApplicationName,
} from './queue.registry';
import type { QueueBossFactory } from './queue.tokens';

function createBoss() {
  return {
    on: vi.fn(),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    createQueue: vi.fn(async () => undefined),
  } as unknown as PgBoss;
}

function createRegistry(
  env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    PROCESS_ROLE: 'api',
    DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:55432/amic_vault',
  },
) {
  const boss = createBoss();
  const factory = vi.fn(async (_options: ConstructorOptions) => {
    void _options;
    return boss;
  }) satisfies QueueBossFactory;
  return { registry: new QueueRegistry(factory, env), boss, factory };
}

describe('QueueRegistry', () => {
  it('owns one named queue lifecycle and stops it idempotently', async () => {
    const { registry, boss, factory } = createRegistry();
    registry.register({ name: 'queue.test', options: { retryLimit: 3 } });

    await expect(registry.producer('queue.test')).resolves.toBe(boss);
    await registry.onModuleDestroy();
    await registry.onModuleDestroy();

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        application_name: queueRegistryApplicationName,
        connectionString: expect.stringContaining('vault_app'),
      }),
    );
    expect(boss.start).toHaveBeenCalledTimes(1);
    expect(boss.createQueue).toHaveBeenCalledWith('queue.test', { retryLimit: 3 });
    expect(boss.stop).toHaveBeenCalledTimes(1);
  });

  it('fails closed for duplicate or unregistered queues and API consumers', async () => {
    const { registry, factory } = createRegistry();
    registry.register({ name: 'queue.test' });

    expect(() => registry.register({ name: 'queue.test' })).toThrow('QUEUE_DUPLICATE_REGISTRATION');
    await expect(registry.producer('queue.missing')).rejects.toThrow('QUEUE_NOT_REGISTERED');
    await expect(registry.consumer('queue.test')).rejects.toThrow('QUEUE_CONSUMER_ROLE_DENIED');
    expect(factory).not.toHaveBeenCalled();
  });

  it('provisions a definition registered after the shared lifecycle has started', async () => {
    const { registry, boss } = createRegistry();
    registry.register({ name: 'queue.first' });
    await registry.producer('queue.first');
    registry.register({ name: 'queue.late', options: { retryLimit: 2 } });

    await expect(registry.producer('queue.late')).resolves.toBe(boss);

    expect(boss.createQueue).toHaveBeenCalledWith('queue.late', { retryLimit: 2 });
  });

  it('creates a registered dead-letter dependency before its main queue', async () => {
    const { registry, boss } = createRegistry();
    const created = new Set<string>();
    vi.mocked(boss.createQueue).mockImplementation(async (name, options) => {
      if (options?.deadLetter && !created.has(options.deadLetter)) {
        throw new Error(`Queue ${options.deadLetter} does not exist`);
      }
      created.add(name);
    });
    registry.register({ name: 'queue.main', options: { deadLetter: 'queue.main.dead' } });
    registry.register({ name: 'queue.main.dead', options: { retryLimit: 0 } });

    await expect(registry.producer('queue.main')).resolves.toBe(boss);

    expect(boss.createQueue).toHaveBeenNthCalledWith(1, 'queue.main.dead', { retryLimit: 0 });
    expect(boss.createQueue).toHaveBeenNthCalledWith(2, 'queue.main', {
      deadLetter: 'queue.main.dead',
    });
  });

  it('fails closed for a missing or cyclic dead-letter dependency', async () => {
    const missing = createRegistry();
    missing.registry.register({
      name: 'queue.main',
      options: { deadLetter: 'queue.main.dead' },
    });
    await expect(missing.registry.producer('queue.main')).rejects.toThrow(
      'QUEUE_DEAD_LETTER_NOT_REGISTERED',
    );

    const cyclic = createRegistry();
    cyclic.registry.register({ name: 'queue.first', options: { deadLetter: 'queue.second' } });
    cyclic.registry.register({ name: 'queue.second', options: { deadLetter: 'queue.first' } });
    await expect(cyclic.registry.producer('queue.first')).rejects.toThrow(
      'QUEUE_DEFINITION_CYCLE',
    );
  });

  it('allows consumer acquisition only in worker role', async () => {
    const { registry, boss } = createRegistry({
      NODE_ENV: 'test',
      PROCESS_ROLE: 'worker',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:55432/amic_vault',
    });
    registry.register({ name: 'queue.test' });

    await expect(registry.consumer('queue.test')).resolves.toBe(boss);
  });

  it('rejects missing runtime authority and production schema mutation', async () => {
    const { registry } = createRegistry({ NODE_ENV: 'production', PROCESS_ROLE: 'worker' });
    registry.register({ name: 'queue.test' });

    await expect(registry.producer('queue.test')).rejects.toThrow('QUEUE_RUNTIME_URL_REQUIRED');
    expect(() =>
      assertRuntimeQueueOptions({ migrate: true, createSchema: false }, { NODE_ENV: 'production' }),
    ).toThrow('QUEUE_RUNTIME_SCHEMA_MUTATION_FORBIDDEN');
  });

  it('rejects a direct production database secret before creating a boss', async () => {
    const { registry, factory } = createRegistry({
      NODE_ENV: 'production',
      PROCESS_ROLE: 'worker',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:55432/amic_vault',
      PGBOSS_MIGRATE_ENABLED: 'true',
    });
    registry.register({ name: 'queue.test' });

    await expect(registry.producer('queue.test')).rejects.toThrow(
      'DATABASE_RUNTIME_URL_DIRECT_ENV_FORBIDDEN',
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('restores the lifecycle baseline across 50 create-close loops', async () => {
    const bosses: PgBoss[] = [];
    for (let index = 0; index < 50; index += 1) {
      const { registry, boss } = createRegistry();
      bosses.push(boss);
      registry.register({ name: `queue.test.${index}` });
      await registry.producer(`queue.test.${index}`);
      await registry.onModuleDestroy();
    }

    expect(bosses.every((boss) => vi.mocked(boss.stop).mock.calls.length === 1)).toBe(true);
  });
});
