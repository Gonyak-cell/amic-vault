import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { LocalAiOpsHealthDto, LocalAiOpsMetricsDto } from '@amic-vault/shared';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { tenantAlphaId } from './helpers/db';
import { loginSearchUser } from './search-permission/search-http-helpers';

describe('Local AI ops integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let adminCookie: string;
  let memberCookie: string;
  let previousGemmaEnabled: string | undefined;

  beforeAll(async () => {
    previousGemmaEnabled = process.env.LOCAL_GEMMA_ENABLED;
    process.env.LOCAL_GEMMA_ENABLED = 'false';
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    adminCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    memberCookie = await loginSearchUser(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
  });

  afterAll(async () => {
    if (previousGemmaEnabled === undefined) delete process.env.LOCAL_GEMMA_ENABLED;
    else process.env.LOCAL_GEMMA_ENABLED = previousGemmaEnabled;
    await app.close();
  });

  it('exposes local AI health and metrics to admins without endpoint or raw AI text', async () => {
    const healthResponse = await fetch(`${baseUrl}/v1/ai/ops/health`, {
      headers: { cookie: adminCookie },
    });
    const healthText = await healthResponse.text();
    expect(healthResponse.status, healthText).toBe(200);
    const health = JSON.parse(healthText) as LocalAiOpsHealthDto;
    expect(health.modelRoute).toBe('local_gemma');
    expect(health.status).toBe('blocked');
    expect(JSON.stringify(health)).not.toMatch(/http|secret|token|prompt|response/i);

    const metricsResponse = await fetch(`${baseUrl}/v1/ai/ops/metrics`, {
      headers: { cookie: adminCookie },
    });
    const metricsText = await metricsResponse.text();
    expect(metricsResponse.status, metricsText).toBe(200);
    const metrics = JSON.parse(metricsText) as LocalAiOpsMetricsDto;
    expect(metrics.prepCompletedCount).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(metrics)).not.toMatch(/body|content|snippet|raw|prompt|response/i);
  });

  it('blocks non-admin users from local AI ops endpoints', async () => {
    const response = await fetch(`${baseUrl}/v1/ai/ops/health`, {
      headers: { cookie: memberCookie },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
