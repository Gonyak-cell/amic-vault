import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { PermissionService } from '../../../apps/api/src/modules/permission/permission.service';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from '../helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaPermissionMemberUserId = '11111111-1111-4111-8111-111111111105';

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
    body: JSON.stringify({ name: `Matter Permission Client ${randomUUID()}` }),
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
      matterCode: `MP-${randomUUID()}`,
      matterName: `Matter Permission ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function addMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  accessLevel: 'read' | 'edit' = 'read',
) {
  const response = await fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: alphaPermissionMemberUserId,
      matterRole: 'member',
      accessLevel,
    }),
  });
  expect(response.status, await response.text()).toBe(201);
}

async function insertExplicitDeny(matterId: string, userId: string) {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO permissions (
          tenant_id, subject_type, subject_id, resource_type, resource_id,
          action, effect, created_by
        )
        VALUES ($1, 'user', $2, 'matter', $3, 'read', 'DENY', $4)
      `,
      [tenantAlphaId, userId, matterId, alphaOwnerUserId],
    );
  });
}

describe('matter permission integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let permissionService: PermissionService;
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
    permissionService = app.get(PermissionService);
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
      email: 'alpha-permission-member@test.local',
      password: 'dev-alpha-permission-member-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows matter reads only for members and hides non-member existence', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMember(baseUrl, ownerCookie, matterId);

    const ownerRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerRead.status, await ownerRead.text()).toBe(200);

    const memberRead = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: memberCookie },
    });
    expect(memberRead.status, await memberRead.text()).toBe(200);

    const adminDenied = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: firmAdminCookie },
    });
    const adminDeniedBody = await adminDenied.text();
    expect(adminDenied.status, adminDeniedBody).toBe(404);
    expect(adminDeniedBody).not.toContain(matterId);
  });

  it('requires edit-level membership for matter edits and uploads', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMember(baseUrl, ownerCookie, matterId, 'read');

    await expect(
      permissionService.canEditMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'DENY' });

    const readOnlyStatus = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(readOnlyStatus.status, await readOnlyStatus.text()).toBe(403);

    const updateMember = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaPermissionMemberUserId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'edit' }),
      },
    );
    expect(updateMember.status, await updateMember.text()).toBe(200);

    await expect(
      permissionService.canEditMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });

    const editStatus = await fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
      method: 'PATCH',
      headers: { cookie: memberCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(editStatus.status, await editStatus.text()).toBe(200);

    await expect(
      permissionService.canUploadToMatter(
        { tenantId: tenantAlphaId, userId: alphaPermissionMemberUserId },
        matterId,
      ),
    ).resolves.toMatchObject({ effect: 'ALLOW' });
  });

  it('applies deny overrides from ethical walls and explicit permission rows', async () => {
    const wallMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const wall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId: wallMatterId,
        wallName: `Matter Permission Wall ${randomUUID()}`,
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
    expect(wall.status, await wall.text()).toBe(201);

    const wallDenied = await fetch(`${baseUrl}/v1/matters/${wallMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    const wallDeniedBody = await wallDenied.text();
    expect(wallDenied.status, wallDeniedBody).toBe(403);
    expect(wallDeniedBody).toContain('ETHICAL_WALL_BLOCKED');

    const deniedMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await insertExplicitDeny(deniedMatterId, alphaOwnerUserId);
    const explicitDenied = await fetch(`${baseUrl}/v1/matters/${deniedMatterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(explicitDenied.status, await explicitDenied.text()).toBe(404);
  });

  it('filters matter lists at query time for rows and total count', async () => {
    const ownerMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    const memberMatterId = await createMatter(baseUrl, ownerCookie, clientId);
    await addMember(baseUrl, ownerCookie, memberMatterId);

    const memberList = await fetch(`${baseUrl}/v1/matters?clientId=${clientId}&pageSize=100`, {
      headers: { cookie: memberCookie },
    });
    const body = await memberList.text();
    expect(memberList.status, body).toBe(200);
    const parsed = JSON.parse(body) as { items: Array<{ matterId: string }>; totalCount: number };
    expect(parsed.items.some((item) => item.matterId === memberMatterId)).toBe(true);
    expect(parsed.items.some((item) => item.matterId === ownerMatterId)).toBe(false);
    expect(parsed.totalCount).toBe(parsed.items.length);
  });
});
