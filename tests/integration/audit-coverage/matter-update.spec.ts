import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<Response> {
  return fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function ownerCookie(baseUrl: string): Promise<string> {
  const response = await login(baseUrl, {
    tenantId: tenantAlphaId,
    email: 'alpha-matter-owner@test.local',
    password: 'dev-alpha-owner-password',
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Audit Matter Client ${randomUUID()}` }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(baseUrl: string, cookie: string, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId,
      matterCode: `AUD-MAT-${randomUUID()}`,
      matterName: `Audit Matter ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function auditCount(action: string, matterId?: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const params = matterId ? [tenantAlphaId, action, matterId] : [tenantAlphaId, action];
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          ${matterId ? 'AND matter_id = $3' : ''}
      `,
      params,
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function latestMatterUpdatedMetadata(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_UPDATED'
          AND matter_id = $2
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows[0]?.metadata_json;
  });
}

describe('matter update audit coverage', () => {
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

  it('covers matter update, status change, and login success/failure audit events', async () => {
    const failedLogin = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'wrong-password',
    });
    expect(failedLogin.status, await failedLogin.text()).toBe(401);

    const cookie = await ownerCookie(baseUrl);
    const clientId = await createClient(baseUrl, cookie);
    const matterId = await createMatter(baseUrl, cookie, clientId);

    const update = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterName: `Audit Matter Updated ${randomUUID()}`,
        metadata: { audit: 'coverage' },
      }),
    });
    expect(update.status, await update.text()).toBe(200);

    const status = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(status.status, await status.text()).toBe(200);

    await expect(auditCount('LOGIN_FAILURE')).resolves.toBeGreaterThanOrEqual(1);
    await expect(auditCount('LOGIN_SUCCESS')).resolves.toBeGreaterThanOrEqual(1);
    await expect(auditCount('MATTER_CREATED', matterId)).resolves.toBe(1);
    await expect(auditCount('MATTER_UPDATED', matterId)).resolves.toBe(1);
    await expect(auditCount('MATTER_STATUS_CHANGED', matterId)).resolves.toBe(1);

    const metadata = await latestMatterUpdatedMetadata(matterId);
    expect(metadata).toEqual({
      matter_id: matterId,
      diff_keys: ['matter_name', 'metadata'],
    });
    expect(JSON.stringify(metadata)).not.toContain('Audit Matter Updated');
    expect(JSON.stringify(metadata)).not.toContain('coverage');
  });
});
