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
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';

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
    body: JSON.stringify({ name: `Permission Audit Client ${randomUUID()}` }),
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
      matterCode: `PA-${randomUUID()}`,
      matterName: `Permission Audit ${randomUUID()}`,
      matterType: 'investigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function reasonCount(reasonCode: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'PERMISSION_CHANGED'
          AND metadata_json->>'reason_code' = $2
      `,
      [tenantAlphaId, reasonCode],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function accessDeniedCount(matterId: string, reasonCode: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ACCESS_DENIED'
          AND matter_id = $2
          AND metadata_json->>'reason_code' = $3
      `,
      [tenantAlphaId, matterId, reasonCode],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function permissionChangedMetadata(reasonCode: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ metadata_json: Record<string, unknown> }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'PERMISSION_CHANGED'
          AND metadata_json->>'reason_code' = $2
        ORDER BY seq DESC
        LIMIT 1
      `,
      [tenantAlphaId, reasonCode],
    );
    return result.rows[0]?.metadata_json ?? {};
  });
}

describe('permission audit integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let securityAdminCookie: string;
  let ownerCookie: string;
  let memberCookie: string;
  let clientId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    memberCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-member@test.local',
      password: 'dev-alpha-member-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records PERMISSION_CHANGED for role, team, and wall mutations', async () => {
    const roleChange = await fetch(`${baseUrl}/v1/users/${alphaMemberUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'limited_reviewer' }),
    });
    expect(roleChange.status, await roleChange.text()).toBe(200);

    const resetRole = await fetch(`${baseUrl}/v1/users/${alphaMemberUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'matter_member' }),
    });
    expect(resetRole.status, await resetRole.text()).toBe(200);

    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const addMember = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
      method: 'POST',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: alphaMemberUserId,
        matterRole: 'member',
        accessLevel: 'read',
      }),
    });
    expect(addMember.status, await addMember.text()).toBe(201);

    const updateMember = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaMemberUserId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'edit' }),
      },
    );
    expect(updateMember.status, await updateMember.text()).toBe(200);

    const removeMember = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaMemberUserId}`,
      {
        method: 'DELETE',
        headers: { cookie: ownerCookie },
      },
    );
    expect(removeMember.status, await removeMember.text()).toBe(204);

    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        wallName: `Permission Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaMemberUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(wall.status, await wall.text()).toBe(201);

    await expect(reasonCount('tenant_role_changed')).resolves.toBeGreaterThanOrEqual(2);
    await expect(reasonCount('member_added')).resolves.toBeGreaterThanOrEqual(2);
    await expect(reasonCount('member_role_changed')).resolves.toBeGreaterThanOrEqual(1);
    await expect(reasonCount('member_removed')).resolves.toBeGreaterThanOrEqual(1);
    await expect(reasonCount('ethical_wall_created')).resolves.toBeGreaterThanOrEqual(1);

    const latest = await permissionChangedMetadata('member_added');
    expect(Object.keys(latest).sort()).toEqual(
      expect.arrayContaining(['after_ref', 'before_ref', 'member_user_id', 'reason_code']),
    );
    expect(JSON.stringify(latest)).not.toContain('@test.local');
  });

  it('records ACCESS_DENIED for nonmember and wall-blocked reads', async () => {
    const nonmemberMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const nonmemberDenied = await fetch(`${baseUrl}/v1/matters/${nonmemberMatterId}`, {
      headers: { cookie: memberCookie },
    });
    expect(nonmemberDenied.status, await nonmemberDenied.text()).toBe(403);
    await expect(
      accessDeniedCount(nonmemberMatterId, 'PERMISSION_DENIED'),
    ).resolves.toBeGreaterThanOrEqual(1);

    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `Owner Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'user',
            subjectId: alphaOwnerUserId,
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(createWall.status, await createWall.text()).toBe(201);

    const wallDenied = await fetch(`${baseUrl}/v1/matters/${wallMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    const wallBody = await wallDenied.text();
    expect(wallDenied.status, wallBody).toBe(403);
    expect(wallBody).toContain('ETHICAL_WALL_BLOCKED');
    await expect(
      accessDeniedCount(wallMatterId, 'ETHICAL_WALL_BLOCKED'),
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
