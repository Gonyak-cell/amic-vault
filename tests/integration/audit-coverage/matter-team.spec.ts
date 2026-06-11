import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, tenantBetaId, withClient } from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
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

async function createClient(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/clients`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Matter Team Client ${randomUUID()}` }),
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
      matterCode: `MT-${randomUUID()}`,
      matterName: `Matter Team ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: betaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function memberRows(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      user_id: string;
      matter_role: string;
      access_level: string;
    }>(
      `
        SELECT user_id, matter_role, access_level
        FROM matter_members
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY user_id
      `,
      [tenantBetaId, matterId],
    );
    return result.rows;
  });
}

async function auditRows(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
        ORDER BY seq ASC
      `,
      [tenantBetaId, matterId],
    );
    return result.rows;
  });
}

async function actionCount(matterId: string, action: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = $3
      `,
      [tenantBetaId, matterId, action],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

describe('matter team integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let betaOwnerCookie: string;
  let betaMemberCookie: string;
  let betaClientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
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
    betaClientId = await createClient(baseUrl, betaOwnerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('manages members with audit and permission-change coverage', async () => {
    const matterId = await createMatter(baseUrl, betaOwnerCookie, betaClientId);

    await expect(memberRows(matterId)).resolves.toEqual([
      {
        user_id: betaOwnerUserId,
        matter_role: 'owner',
        access_level: 'edit',
      },
    ]);

    const add = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: betaMemberUserId,
        matterRole: 'member',
        accessLevel: 'read',
      }),
    });
    expect(add.status, await add.text()).toBe(201);

    const duplicate = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: betaMemberUserId,
        matterRole: 'member',
        accessLevel: 'read',
      }),
    });
    expect(duplicate.status, await duplicate.text()).toBe(409);

    const invalidRoleAccess = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: betaMemberUserId,
        matterRole: 'limited_reviewer',
        accessLevel: 'edit',
      }),
    });
    expect(invalidRoleAccess.status, await invalidRoleAccess.text()).toBe(400);

    const update = await fetch(`${baseUrl}/v1/matters/${matterId}/members/${betaMemberUserId}`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterRole: 'limited_reviewer', accessLevel: 'read' }),
    });
    expect(update.status, await update.text()).toBe(200);

    const beforeNoopRoleEvents = await actionCount(matterId, 'MATTER_MEMBER_ROLE_CHANGED');
    const noop = await fetch(`${baseUrl}/v1/matters/${matterId}/members/${betaMemberUserId}`, {
      method: 'PATCH',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ matterRole: 'limited_reviewer', accessLevel: 'read' }),
    });
    expect(noop.status, await noop.text()).toBe(200);
    await expect(actionCount(matterId, 'MATTER_MEMBER_ROLE_CHANGED')).resolves.toBe(
      beforeNoopRoleEvents,
    );

    const remove = await fetch(`${baseUrl}/v1/matters/${matterId}/members/${betaMemberUserId}`, {
      method: 'DELETE',
      headers: { cookie: betaOwnerCookie },
    });
    expect(remove.status, await remove.text()).toBe(204);

    const removeLastOwner = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${betaOwnerUserId}`,
      {
        method: 'DELETE',
        headers: { cookie: betaOwnerCookie },
      },
    );
    expect(removeLastOwner.status, await removeLastOwner.text()).toBe(400);

    const audits = await auditRows(matterId);
    expect(audits.map((row) => row.action)).toContain('MATTER_MEMBER_ADDED');
    expect(audits.map((row) => row.action)).toContain('MATTER_MEMBER_ROLE_CHANGED');
    expect(audits.map((row) => row.action)).toContain('MATTER_MEMBER_REMOVED');
    expect(
      audits.filter((row) => row.action === 'PERMISSION_CHANGED').length,
    ).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(audits.map((row) => row.metadata_json))).not.toContain('@test.local');
    expect(JSON.stringify(audits.map((row) => row.metadata_json))).not.toContain('Beta Member');
  });

  it('fails closed for unauthorized member writes and cross-tenant users', async () => {
    const matterId = await createMatter(baseUrl, betaOwnerCookie, betaClientId);
    const beforeMemberAudit = await actionCount(matterId, 'MATTER_MEMBER_ADDED');

    const denied = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: betaMemberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: betaMemberUserId,
        matterRole: 'member',
        accessLevel: 'read',
      }),
    });
    expect(denied.status, await denied.text()).toBe(403);
    await expect(actionCount(matterId, 'MATTER_MEMBER_ADDED')).resolves.toBe(beforeMemberAudit);

    const crossTenant = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: betaOwnerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: alphaOwnerUserId,
        matterRole: 'member',
        accessLevel: 'read',
      }),
    });
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).not.toContain(alphaOwnerUserId);

    const audits = await auditRows(matterId);
    expect(audits.map((row) => row.action)).toContain('ACCESS_DENIED');
  });
});
