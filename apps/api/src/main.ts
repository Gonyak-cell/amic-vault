import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
