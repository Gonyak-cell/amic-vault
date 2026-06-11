import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';

describe('observability integration', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves public health endpoints without internal details', async () => {
    const live = await fetch(`${baseUrl}/v1/health/live`);
    const ready = await fetch(`${baseUrl}/v1/health/ready`);

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });
    expect(ready.status).toBe(200);
    expect(JSON.stringify(await ready.json())).not.toContain('postgres');
  });

  it('propagates valid request ids to headers and error bodies', async () => {
    const response = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { 'x-request-id': 'req-observability-1' },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBe('req-observability-1');
    expect(body).toMatchObject({
      code: 'AUTH_REQUIRED',
      requestId: 'req-observability-1',
    });
  });

  it('replaces malformed external request ids', async () => {
    const response = await fetch(`${baseUrl}/v1/health/live`, {
      headers: { 'x-request-id': 'bad id with spaces' },
    });

    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('serves prometheus metrics without tenant or user identifiers', async () => {
    await fetch(`${baseUrl}/v1/health/live`);
    const response = await fetch(`${baseUrl}/metrics`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_ms_bucket');
    expect(body).not.toContain('tenant_id');
    expect(body).not.toContain('user_id');
    expect(body).not.toContain('@test.local');
  });
});
