import { describe, expect, it, vi } from 'vitest';
import type { ConstructorOptions, PgBoss } from 'pg-boss';
import { QueueRegistry } from '../../../apps/api/src/common/queue/queue.registry';
import type { QueueBossFactory } from '../../../apps/api/src/common/queue/queue.tokens';

describe('queue database outage fail-closed', () => {
  it('does not hand out a producer or consumer when PgBoss cannot connect', async () => {
    const unavailableFactory = (async (_options: ConstructorOptions) => {
      void _options;
      throw new Error('QUEUE_DATABASE_UNAVAILABLE');
    }) satisfies QueueBossFactory;
    const registry = new QueueRegistry(unavailableFactory, {
      NODE_ENV: 'test',
      PROCESS_ROLE: 'worker',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:1/amic_vault',
    });
    registry.register({ name: 'queue.outage' });

    await expect(registry.producer('queue.outage')).rejects.toThrow('QUEUE_DATABASE_UNAVAILABLE');
    await expect(registry.consumer('queue.outage')).rejects.toThrow('QUEUE_DATABASE_UNAVAILABLE');
  });

  it('rejects handles after shutdown instead of recreating a queue connection', async () => {
    const boss = {
      on: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      createQueue: vi.fn(async () => undefined),
    } as unknown as PgBoss;
    const factory = vi.fn(async () => boss) satisfies QueueBossFactory;
    const registry = new QueueRegistry(factory, {
      NODE_ENV: 'test',
      PROCESS_ROLE: 'worker',
      DATABASE_RUNTIME_URL: 'postgres://vault_app:test@localhost:5432/amic_vault',
    });
    registry.register({ name: 'queue.shutdown' });
    await Promise.all([
      registry.producer('queue.shutdown'),
      registry.consumer('queue.shutdown'),
    ]);
    expect(factory).toHaveBeenCalledTimes(1);
    await registry.onModuleDestroy();
    expect(boss.stop).toHaveBeenCalledTimes(1);

    await expect(registry.producer('queue.shutdown')).rejects.toThrow('QUEUE_REGISTRY_STOPPED');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
