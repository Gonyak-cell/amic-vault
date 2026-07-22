import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertRuntimeDatabaseRole } from './common/db/runtime-role.assertion';
import { StructuredLogger } from './common/logging/logger';
import { setDefaultProcessRole } from './common/process-role';

export function configureWorkerProcessEnv(env: NodeJS.ProcessEnv = process.env): void {
  setDefaultProcessRole('worker', env);
}

export async function bootstrapWorker(): Promise<INestApplicationContext> {
  configureWorkerProcessEnv();
  await assertRuntimeDatabaseRole();
  const logger = new StructuredLogger();
  const app = await NestFactory.createApplicationContext(AppModule, { logger });
  app.enableShutdownHooks();
  return app;
}

if (require.main === module) {
  void bootstrapWorker();
}
