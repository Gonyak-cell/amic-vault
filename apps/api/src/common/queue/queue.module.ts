import { Global, Module } from '@nestjs/common';
import type { ConstructorOptions, PgBoss } from 'pg-boss';
import { QueueRegistry } from './queue.registry';
import { QUEUE_BOSS_FACTORY, QUEUE_RUNTIME_ENV, type QueueBossFactory } from './queue.tokens';

export async function createQueueBoss(options: ConstructorOptions): Promise<PgBoss> {
  const { PgBoss } = await import('pg-boss');
  return new PgBoss(options);
}

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_RUNTIME_ENV,
      useFactory: (): NodeJS.ProcessEnv => process.env,
    },
    {
      provide: QUEUE_BOSS_FACTORY,
      useValue: createQueueBoss satisfies QueueBossFactory,
    },
    QueueRegistry,
  ],
  exports: [QueueRegistry],
})
export class QueueModule {}
