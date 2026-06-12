import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

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
    body: JSON.stringify({ name: `Ethical Wall Client ${randomUUID()}` }),
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
      matterCode: `EW-${randomUUID()}`,
      matterName: `Ethical Wall Matter ${randomUUID()}`,
      matterType: 'investigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function wallAuditRows(wallId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT action, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND (
            metadata_json->>'wall_id' = $2
            OR target_id = $2::uuid
          )
        ORDER BY seq ASC
      `,
      [tenantAlphaId, wallId],
    );
    return result.rows;
  });
}

describe('ethical wall integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let securityAdminCookie: string;
  let clientId: string;
  let matterId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    ownerCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    securityAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-security-admin@test.local',
      password: 'dev-alpha-security-admin-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
    matterId = await createMatter(baseUrl, ownerCookie, clientId);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a wall, records reference-only audit metadata, and denies excluded reads', async () => {
    const beforeWall = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(beforeWall.status, await beforeWall.text()).toBe(200);

    const wallName = `Conflict ${randomUUID()}`;
    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        wallName,
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
    const createBody = await createWall.text();
    expect(createWall.status, createBody).toBe(201);
    const created = JSON.parse(createBody) as {
      wall: { wallId: string; wallName: string; matterId: string };
      memberships: Array<{ subjectId: string; membershipType: string }>;
    };
    expect(created.wall).toMatchObject({ wallName, matterId });
    expect(created.memberships).toHaveLength(1);

    const audits = await wallAuditRows(created.wall.wallId);
    expect(audits.map((row) => row.action)).toEqual([
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'ETHICAL_WALL_APPLIED',
      'PERMISSION_CHANGED',
    ]);
    for (const row of audits) {
      expect(JSON.stringify(row.metadata_json)).not.toContain(wallName);
      expect(JSON.stringify(row.metadata_json)).not.toContain('conflict_check');
    }

    const afterWall = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    const afterBody = await afterWall.text();
    expect(afterWall.status, afterBody).toBe(403);
    expect(afterBody).toContain('ETHICAL_WALL_BLOCKED');

    const list = await fetch(`${baseUrl}/v1/matters?clientId=${clientId}&pageSize=100`, {
      headers: { cookie: ownerCookie },
    });
    const listBody = await list.text();
    expect(list.status, listBody).toBe(200);
    const listedMatterIds = (
      JSON.parse(listBody) as { items: Array<{ matterId: string }> }
    ).items.map((item) => item.matterId);
    expect(listedMatterIds).not.toContain(matterId);
  });

  it('rejects group memberships before group wall expansion and keeps wall rows tenant-scoped', async () => {
    const groupDenied = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        wallName: `Group Conflict ${randomUUID()}`,
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'group',
            subjectId: randomUUID(),
            membershipType: 'excluded',
          },
        ],
      }),
    });
    expect(groupDenied.status, await groupDenied.text()).toBe(400);

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query('SELECT wall_id FROM ethical_walls WHERE tenant_id = $1', [
        tenantAlphaId,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });

  it('lets Security Admin list and manage wall memberships with audit coverage', async () => {
    const createWall = await fetch(`${baseUrl}/v1/ethical-walls`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        matterId,
        wallName: `Managed Wall ${randomUUID()}`,
        reason: 'conflict_check',
        members: [],
      }),
    });
    const createBody = await createWall.text();
    expect(createWall.status, createBody).toBe(201);
    const created = JSON.parse(createBody) as {
      wall: { wallId: string; matterId: string };
      memberships: Array<{ membershipId: string }>;
    };
    expect(created.memberships).toEqual([]);

    const ownerListDenied = await fetch(`${baseUrl}/v1/ethical-walls?matterId=${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerListDenied.status, await ownerListDenied.text()).toBe(403);

    const listBefore = await fetch(`${baseUrl}/v1/ethical-walls?matterId=${matterId}`, {
      headers: { cookie: securityAdminCookie },
    });
    const listBeforeBody = await listBefore.text();
    expect(listBefore.status, listBeforeBody).toBe(200);
    expect(listBeforeBody).toContain(created.wall.wallId);

    const addMembership = await fetch(
      `${baseUrl}/v1/ethical-walls/${created.wall.wallId}/memberships`,
      {
        method: 'POST',
        headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          subjectType: 'user',
          subjectId: alphaMemberUserId,
          membershipType: 'excluded',
        }),
      },
    );
    const addBody = await addMembership.text();
    expect(addMembership.status, addBody).toBe(201);
    const membership = JSON.parse(addBody) as {
      membershipId: string;
      subjectId: string;
      membershipType: string;
    };
    expect(membership).toMatchObject({
      subjectId: alphaMemberUserId,
      membershipType: 'excluded',
    });

    const listAfterAdd = await fetch(`${baseUrl}/v1/ethical-walls?matterId=${matterId}`, {
      headers: { cookie: securityAdminCookie },
    });
    const listAfterAddBody = await listAfterAdd.text();
    expect(listAfterAdd.status, listAfterAddBody).toBe(200);
    expect(listAfterAddBody).toContain(alphaMemberUserId);

    const removeMembership = await fetch(
      `${baseUrl}/v1/ethical-walls/${created.wall.wallId}/memberships/${membership.membershipId}`,
      { method: 'DELETE', headers: { cookie: securityAdminCookie } },
    );
    expect(removeMembership.status, await removeMembership.text()).toBe(200);

    const listAfterRemove = await fetch(`${baseUrl}/v1/ethical-walls?matterId=${matterId}`, {
      headers: { cookie: securityAdminCookie },
    });
    const listAfterRemoveBody = await listAfterRemove.text();
    expect(listAfterRemove.status, listAfterRemoveBody).toBe(200);
    expect(listAfterRemoveBody).not.toContain(membership.membershipId);

    const audits = await wallAuditRows(created.wall.wallId);
    expect(audits.map((row) => row.action)).toEqual([
      'ETHICAL_WALL_CREATED',
      'ETHICAL_WALL_APPLIED',
      'PERMISSION_CHANGED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'PERMISSION_CHANGED',
      'ETHICAL_WALL_MEMBERSHIP_CHANGED',
      'PERMISSION_CHANGED',
    ]);
    for (const row of audits) {
      expect(JSON.stringify(row.metadata_json)).not.toContain('Managed Wall');
      expect(JSON.stringify(row.metadata_json)).not.toContain('conflict_check');
    }
  });
});
