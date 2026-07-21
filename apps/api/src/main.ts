import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logging/logger';
import { setDefaultProcessRole } from './common/process-role';
import { noStoreApiMiddleware } from './common/security/no-store.middleware';
import { assertRuntimeDatabaseRole } from './common/db/runtime-role.assertion';

export function configureApp(app: INestApplication): void {
  app.use(noStoreApiMiddleware);
  const webOrigin =
    process.env.WEB_ORIGIN ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
  if (webOrigin) {
    app.enableCors({
      origin: webOrigin,
      credentials: true,
    });
  }
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
}

export function configureApiProcessEnv(env: NodeJS.ProcessEnv = process.env): void {
  setDefaultProcessRole('api', env);
}

export async function bootstrap(): Promise<void> {
  configureApiProcessEnv();
  await assertRuntimeDatabaseRole();
  const logger = new StructuredLogger();
  const app = await NestFactory.create(AppModule, { logger });
  configureApp(app);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
