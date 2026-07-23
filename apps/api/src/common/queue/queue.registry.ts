import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConstructorOptions, PgBoss, Queue } from 'pg-boss';
import { RuntimeSecretError, runtimeSecretValue } from '../config/runtime-secret';
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
  private readonly createdQueueNames = new Set<string>();
  private readonly queueCreationPromises = new Map<string, Promise<void>>();
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
    const boss = await this.ensureStarted();
    await this.ensureQueueCreated(boss, name);
    return boss;
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
    let connectionString: string;
    try {
      connectionString = runtimeSecretValue('DATABASE_RUNTIME_URL', this.env, {
        maximumBytes: 4096,
      });
    } catch (error) {
      if (error instanceof RuntimeSecretError && error.code === 'DATABASE_RUNTIME_URL_REQUIRED') {
        throw new Error('QUEUE_RUNTIME_URL_REQUIRED');
      }
      throw error;
    }

    const options = pgBossRuntimeOptions({
      applicationName: queueRegistryApplicationName,
      env: this.env,
    });
    assertRuntimeQueueOptions(options, this.env);

    const boss = await this.createBoss({ connectionString, ...options });
    boss.on('error', () => {
      this.logger.warn({ code: 'QUEUE_REGISTRY_ERROR' });
    });

    try {
      await boss.start();
      this.boss = boss;
      for (const definition of this.definitions.values()) {
        await this.ensureQueueCreated(boss, definition.name);
      }
      return boss;
    } catch (error) {
      this.boss = undefined;
      await boss.stop().catch(() => undefined);
      throw error;
    }
  }

  private async ensureQueueCreated(boss: PgBoss, name: string): Promise<void> {
    if (this.createdQueueNames.has(name)) return;
    const definition = this.definitions.get(name);
    if (!definition) throw new Error('QUEUE_NOT_REGISTERED');

    let creation = this.queueCreationPromises.get(name);
    if (!creation) {
      creation = boss.createQueue(name, definition.options).then(() => {
        this.createdQueueNames.add(name);
      });
      this.queueCreationPromises.set(name, creation);
      void creation.then(
        () => this.queueCreationPromises.delete(name),
        () => this.queueCreationPromises.delete(name),
      );
    }
    await creation;
  }

  private async stopOnce(): Promise<void> {
    this.stopped = true;
    const started = await this.startPromise?.catch(() => undefined);
    const boss = this.boss ?? started;
    if (boss) await boss.stop();
  }
}
