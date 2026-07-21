import type { ConstructorOptions, PgBoss } from 'pg-boss';

export type QueueBossFactory = (options: ConstructorOptions) => Promise<PgBoss>;

export const QUEUE_BOSS_FACTORY = Symbol('QUEUE_BOSS_FACTORY');
export const QUEUE_RUNTIME_ENV = Symbol('QUEUE_RUNTIME_ENV');
