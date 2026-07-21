import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConstructorOptions, PgBoss, Queue } from 'pg-boss';
import { pgBossRuntimeOptions } from '../db/pg-boss-runtime-options';
import { currentProcessRole } from '../process-role';
import { QUEUE_BOSS_FACTORY, QUEUE_RUNTIME_ENV, type QueueBossFactory } from './queue.tokens';

const queueNamePattern = /^[a-z][a-z0-9.-]{0,127}$/;
export const queueRegistryApplicationName = 'amic-vault-queue-registry';

export interface QueueDefinition {
  name: string;
  options?: Omit<Queue, 'name'>;
}

export function assertRuntimeQueueOptions(
  options: Pick<ConstructorOptions, 'migrate' | 'createSchema'>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && (options.migrate || options.createSchema)) {
    throw new Error('QUEUE_RUNTIME_SCHEMA_MUTATION_FORBIDDEN');
  }
}

@Injectable()
export class QueueRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(QueueRegistry.name);
  private readonly definitions = new Map<string, QueueDefinition>();
  private boss: PgBoss | undefined;
  private startPromise: Promise<PgBoss> | undefined;
  private closePromise: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(QUEUE_BOSS_FACTORY) private readonly createBoss: QueueBossFactory,
    @Inject(QUEUE_RUNTIME_ENV) private readonly env: NodeJS.ProcessEnv,
  ) {}

  register(definition: QueueDefinition): void {
    if (this.stopped) throw new Error('QUEUE_REGISTRY_STOPPED');
    if (!queueNamePattern.test(definition.name)) throw new Error('QUEUE_DEFINITION_INVALID');
    if (this.definitions.has(definition.name)) throw new Error('QUEUE_DUPLICATE_REGISTRATION');
    this.definitions.set(definition.name, { ...definition });
  }

  registeredQueueNames(): string[] {
    return [...this.definitions.keys()].sort();
  }

  async producer(name: string): Promise<PgBoss> {
    this.assertRegistered(name);
    return this.ensureStarted();
  }

  async consumer(name: string): Promise<PgBoss> {
    if (currentProcessRole(this.env) !== 'worker') throw new Error('QUEUE_CONSUMER_ROLE_DENIED');
    return this.producer(name);
  }

  async onModuleDestroy(): Promise<void> {
    this.closePromise ??= this.stopOnce();
    await this.closePromise;
  }

  private assertRegistered(name: string): void {
    if (!this.definitions.has(name)) throw new Error('QUEUE_NOT_REGISTERED');
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (this.stopped) throw new Error('QUEUE_REGISTRY_STOPPED');
    if (this.boss) return this.boss;

    const startPromise = (this.startPromise ??= this.createStartedBoss());
    try {
      return await startPromise;
    } finally {
      if (this.startPromise === startPromise) this.startPromise = undefined;
    }
  }

  private async createStartedBoss(): Promise<PgBoss> {
    const connectionString = this.env.DATABASE_RUNTIME_URL?.trim();
    if (!connectionString) throw new Error('QUEUE_RUNTIME_URL_REQUIRED');

    const options = pgBossRuntimeOptions({
      applicationName: queueRegistryApplicationName,
      env: this.env,
    });
    assertRuntimeQueueOptions(options, this.env);

    const boss = await this.createBoss({ connectionString, ...options });
    boss.on('error', (error) => {
      this.logger.warn({ code: 'QUEUE_REGISTRY_ERROR', message: String(error.message) });
    });

    try {
      await boss.start();
      for (const definition of this.definitions.values()) {
        await boss.createQueue(definition.name, definition.options);
      }
      this.boss = boss;
      return boss;
    } catch (error) {
      await boss.stop().catch(() => undefined);
      throw error;
    }
  }

  private async stopOnce(): Promise<void> {
    this.stopped = true;
    const started = await this.startPromise?.catch(() => undefined);
    const boss = this.boss ?? started;
    if (boss) await boss.stop();
  }
}
