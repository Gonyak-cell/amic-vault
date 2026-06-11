import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createAppClient, createOwnerClient, setTenant, tenantAlphaId, tenantBetaId, withClient } from './helpers/db';

const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';
const betaMemberUserId = '22222222-2222-4222-8222-222222222202';

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

async function createClient(baseUrl: string, cookie: string, name: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { clientId: string }).clientId;
}

async function createMatter(
  baseUrl: string,
  cookie: string,
  input: {
    clientId: string;
    matterCode?: string;
    matterName?: string;
    matterType?: string;
    leadLawyerId?: string;
  },
) {
  return fetch(`${baseUrl}/v1/matters`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      matterCode: input.matterCode ?? `M-${randomUUID()}`,
      matterName: input.matterName ?? `Matter ${randomUUID()}`,
      matterType: input.matterType ?? 'contract',
      leadLawyerId: input.leadLawyerId,
    }),
  });
}

async function latestMatterAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_CREATED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, matterId],
    );
    return result.rows[0];
  });
}

async function latestMatterUpdateAudit(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'MATTER_UPDATED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantBetaId, matterId],
    );
    return result.rows[0];
  });
}

describe('matter core integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let alphaOwnerCookie: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaClientId: string;

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
    betaClientId = await createClient(baseUrl, betaOwnerCookie, `Beta Matter Client ${randomUUID()}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and reads a matter with reference-only audit metadata', async () => {
    const response = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterName: 'Beta Confidential Matter',
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const matter = JSON.parse(body) as { matterId: string; leadLawyerId: string; status: string };
    expect(matter.leadLawyerId).toBe(betaOwnerUserId);
    expect(matter.status).toBe('proposed');

    const audit = await latestMatterAudit(matter.matterId);
    expect(audit?.metadata_json).toEqual({
      matter_id: matter.matterId,
      client_id: betaClientId,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Beta Confidential Matter');

    const detail = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      headers: { cookie: betaOwnerCookie },
    });
    expect(detail.status, await detail.text()).toBe(200);
  });

  it('updates matter metadata with diff-only audit metadata', async () => {
    const response = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterName: 'Beta Matter Before Update',
    });
    const body = await response.text();
    expect(response.status, body).toBe(201);
    const matter = JSON.parse(body) as { matterId: string };

    const update = await fetch(`${baseUrl}/v1/matters/${matter.matterId}`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterName: 'Beta Matter After Update',
        metadata: { stage: 'intake' },
      }),
    });
    const updateBody = await update.text();
    expect(update.status, updateBody).toBe(200);
    expect(JSON.parse(updateBody)).toMatchObject({
      matterName: 'Beta Matter After Update',
      metadata: { stage: 'intake' },
    });

    const audit = await latestMatterUpdateAudit(matter.matterId);
    expect(audit?.metadata_json).toEqual({
      matter_id: matter.matterId,
      diff_keys: ['matter_name', 'metadata'],
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('Beta Matter After Update');
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('intake');
  });

  it('fails closed for invalid clients, cross-tenant clients, and non-manager creates', async () => {
    const missingClient = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: randomUUID(),
    });
    expect(missingClient.status, await missingClient.text()).toBe(400);

    const alphaClientId = await createClient(baseUrl, alphaOwnerCookie, `Alpha Matter Client ${randomUUID()}`);
    const crossTenant = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: alphaClientId,
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).toContain('PERMISSION_DENIED');
    expect(crossTenantBody).not.toContain(alphaClientId);

    const denied = await createMatter(baseUrl, betaMemberCookie, {
      clientId: betaClientId,
    });
    expect(denied.status, await denied.text()).toBe(403);

    const invalidType = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterType: 'MA',
    });
    expect(invalidType.status, await invalidType.text()).toBe(400);
  });

  it('applies membership detail and list guards at query time', async () => {
    const ownerMatterResponse = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterCode: `OWNER-${randomUUID()}`,
      matterType: 'finance',
    });
    const ownerMatter = JSON.parse(await ownerMatterResponse.text()) as { matterId: string };

    const memberMatterResponse = await createMatter(baseUrl, betaOwnerCookie, {
      clientId: betaClientId,
      matterCode: `MEMBER-${randomUUID()}`,
      matterType: 'finance',
      leadLawyerId: betaMemberUserId,
    });
    const memberMatter = JSON.parse(await memberMatterResponse.text()) as { matterId: string };

    const memberDenied = await fetch(`${baseUrl}/v1/matters/${ownerMatter.matterId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(memberDenied.status, await memberDenied.text()).toBe(404);

    const memberDetail = await fetch(`${baseUrl}/v1/matters/${memberMatter.matterId}`, {
      headers: { cookie: betaMemberCookie },
    });
    expect(memberDetail.status, await memberDetail.text()).toBe(200);

    const ownerList = await fetch(
      `${baseUrl}/v1/matters?matterType=finance&clientId=${betaClientId}&pageSize=100`,
      { headers: { cookie: betaOwnerCookie } },
    );
    const ownerListBody = await ownerList.text();
    expect(ownerList.status, ownerListBody).toBe(200);
    const ownerItems = (JSON.parse(ownerListBody) as { items: Array<{ matterId: string }> }).items;
    expect(ownerItems.some((item) => item.matterId === ownerMatter.matterId)).toBe(true);
    expect(ownerItems.some((item) => item.matterId === memberMatter.matterId)).toBe(false);

    const crossTenant = await fetch(`${baseUrl}/v1/matters/${memberMatter.matterId}`, {
      headers: { cookie: alphaOwnerCookie },
    });
    expect(crossTenant.status, await crossTenant.text()).toBe(404);
  });

  it('enforces DB checks and RLS through the app role', async () => {
    await withClient(createOwnerClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      await expect(
        client.query(
          `
            INSERT INTO matters (
              tenant_id, client_id, matter_code, matter_name, matter_type, created_by
            )
            VALUES ($1, $2, $3, 'Invalid Type Matter', 'MA', $4)
          `,
          [tenantBetaId, betaClientId, `BADTYPE-${randomUUID()}`, betaOwnerUserId],
        ),
      ).rejects.toThrow(/matters_matter_type_check/);
      await expect(
        client.query(
          `
            INSERT INTO matters (
              tenant_id, client_id, matter_code, matter_name, matter_type,
              opened_at, closed_at, created_by
            )
            VALUES (
              $1, $2, $3, 'Bad Dates Matter', 'contract',
              '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', $4
            )
          `,
          [tenantBetaId, betaClientId, `BADDATES-${randomUUID()}`, betaOwnerUserId],
        ),
      ).rejects.toThrow(/check constraint/);
    });

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantAlphaId);
      const result = await client.query('SELECT matter_id FROM matters WHERE tenant_id = $1', [
        tenantBetaId,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });
});
