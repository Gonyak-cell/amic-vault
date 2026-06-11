import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function latestClientAudit(clientId: string, action: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
      actor_id: string | null;
    }>(
      `
        SELECT metadata_json, actor_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, action, clientId],
    );
    return result.rows[0];
  });
}

describe('client registry integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    alphaOwnerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    betaOwnerCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-matter-owner@test.local',
      password: 'dev-beta-owner-password',
    });
    betaMemberCookie = await login(baseUrl, {
      tenantId: tenantBetaId,
      email: 'beta-member@test.local',
      password: 'dev-beta-member-password',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, reads, lists, and updates clients with audit metadata by reference only', async () => {
    const clientName = `Alpha Strategic Client ${randomUUID()}`;
    const queryToken = clientName.slice('Alpha Strategic Client '.length);
    const create = await fetch(`${baseUrl}/v1/clients`, {
      method: 'POST',
      headers: { cookie: alphaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: clientName,
        clientType: 'corporation',
        confidentialityLevel: 'high',
        metadata: { externalRef: 'CRM-001' },
      }),
    });
    const createBody = await create.text();
    expect(create.status, createBody).toBe(201);
    const created = JSON.parse(createBody) as { clientId: string; name: string };
    expect(created.name).toBe(clientName);

    const createAudit = await latestClientAudit(created.clientId, 'CLIENT_CREATED');
    expect(createAudit?.metadata_json).toEqual({ client_id: created.clientId });
    expect(JSON.stringify(createAudit?.metadata_json)).not.toContain('Alpha Strategic Client');

    const detail = await fetch(`${baseUrl}/v1/clients/${created.clientId}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(detail.status, await detail.text()).toBe(200);

    const list = await fetch(
      `${baseUrl}/v1/clients?q=${encodeURIComponent(queryToken)}&pageSize=100`,
      { headers: { cookie: alphaOwnerCookie } },
    );
    const listBody = await list.text();
    expect(list.status, listBody).toBe(200);
    expect(JSON.parse(listBody)).toMatchObject({ totalCount: 1 });

    const update = await fetch(`${baseUrl}/v1/clients/${created.clientId}`, {
      method: 'PATCH',
      headers: { cookie: alphaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dormant', confidentialityLevel: 'restricted' }),
    });
    const updateBody = await update.text();
    expect(update.status, updateBody).toBe(200);
    expect(JSON.parse(updateBody)).toMatchObject({
      status: 'dormant',
      confidentialityLevel: 'restricted',
    });

    const updateAudit = await latestClientAudit(created.clientId, 'CLIENT_UPDATED');
    expect(updateAudit?.metadata_json).toEqual({
      client_id: created.clientId,
      diff_keys: ['confidentiality_level', 'status'],
    });
  });

  it('blocks non-manager writes and hides cross-tenant client ids', async () => {
    const denied = await fetch(`${baseUrl}/v1/clients`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Denied Client' }),
    });
    const deniedBody = await denied.text();
    expect(denied.status, deniedBody).toBe(403);
    expect(deniedBody).toContain('PERMISSION_DENIED');

    const create = await fetch(`${baseUrl}/v1/clients`, {
      method: 'POST',
      headers: { cookie: alphaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alpha Private Client' }),
    });
    const alphaClient = JSON.parse(await create.text()) as { clientId: string; name: string };

    const crossTenant = await fetch(`${baseUrl}/v1/clients/${alphaClient.clientId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).not.toContain(alphaClient.clientId);
    expect(crossTenantBody).not.toContain(alphaClient.name);
  });

  it('enforces clients RLS through the app role', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query(
        'SELECT client_id FROM clients WHERE tenant_id = $1',
        [tenantAlphaId],
      );
      expect(result.rowCount).toBe(0);
    });
  });
});
