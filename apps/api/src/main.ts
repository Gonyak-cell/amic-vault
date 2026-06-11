import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/logging/logger';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
}

export async function bootstrap(): Promise<void> {
  const logger = new StructuredLogger();
  const app = await NestFactory.create(AppModule, { logger });
  configureApp(app);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
