import { RequestMethod, type INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApp } from './main';
import { noStoreApiMiddleware } from './common/security/no-store.middleware';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
};

function appDouble() {
  return {
    enableCors: vi.fn(),
    setGlobalPrefix: vi.fn(),
    use: vi.fn(),
  } as unknown as INestApplication;
}

describe('configureApp', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.WEB_ORIGIN = originalEnv.WEB_ORIGIN;
  });

  it('enables credentialed local web CORS outside production', () => {
    delete process.env.WEB_ORIGIN;
    process.env.NODE_ENV = 'test';
    const app = appDouble();

    configureApp(app);

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'http://localhost:3000',
      credentials: true,
    });
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1', {
      exclude: [{ path: 'metrics', method: RequestMethod.GET }],
    });
    expect(app.use).toHaveBeenCalledWith(noStoreApiMiddleware);
  });

  it('requires an explicit web origin before enabling CORS in production', () => {
    delete process.env.WEB_ORIGIN;
    process.env.NODE_ENV = 'production';
    const app = appDouble();

    configureApp(app);

    expect(app.enableCors).not.toHaveBeenCalled();
  });

  it('uses the configured web origin when one is provided', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://vault.example.test';
    const app = appDouble();

    configureApp(app);

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'https://vault.example.test',
      credentials: true,
    });
  });
});
