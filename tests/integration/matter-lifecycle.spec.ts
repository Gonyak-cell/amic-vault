import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
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
    body: JSON.stringify({ name: `Matter Lifecycle Client ${randomUUID()}` }),
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
      matterCode: `ML-${randomUUID()}`,
      matterName: `Matter Lifecycle ${randomUUID()}`,
      matterType: 'contract',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function updateStatus(baseUrl: string, cookie: string, matterId: string, status: string) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/status`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

async function addMember(
  baseUrl: string,
  cookie: string,
  matterId: string,
  userId = alphaMemberUserId,
) {
  return fetch(`${baseUrl}/v1/matters/${matterId}/members`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      matterRole: 'member',
      accessLevel: 'read',
    }),
  });
}

async function transitionAudits(matterId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND matter_id = $2
          AND action = 'MATTER_STATUS_CHANGED'
        ORDER BY seq ASC
      `,
      [tenantAlphaId, matterId],
    );
    return result.rows.map((row) => row.metadata_json);
  });
}

async function insertInvalidStatus(clientId: string) {
  return withClient(createOwnerClient(), async (client) => {
    await expect(
      client.query(
        `
          INSERT INTO matters (
            tenant_id, client_id, matter_code, matter_name, matter_type, status, created_by
          )
          VALUES ($1, $2, $3, 'Invalid Status Matter', 'contract', 'deleted', $4)
        `,
        [tenantAlphaId, clientId, `BADSTATUS-${randomUUID()}`, alphaOwnerUserId],
      ),
    ).rejects.toThrow(/matters_status_check/);
  });
}

describe('matter lifecycle integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
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

  it('applies the R1 lifecycle transitions with timestamps and audit', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);

    const opened = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    const openedBody = await opened.text();
    expect(opened.status, openedBody).toBe(200);
    expect(JSON.parse(openedBody)).toMatchObject({ status: 'open' });
    expect((JSON.parse(openedBody) as { openedAt: string | null }).openedAt).toEqual(
      expect.any(String),
    );

    for (const status of ['active', 'closing', 'closed', 'archived']) {
      const response = await updateStatus(baseUrl, ownerCookie, matterId, status);
      const body = await response.text();
      expect(response.status, body).toBe(200);
      expect(JSON.parse(body)).toMatchObject({ status });
      if (status === 'closed') {
        expect((JSON.parse(body) as { closedAt: string | null }).closedAt).toEqual(
          expect.any(String),
        );
      }
    }

    const audits = await transitionAudits(matterId);
    expect(audits).toEqual([
      expect.objectContaining({ before_ref: 'status:proposed', after_ref: 'status:open' }),
      expect.objectContaining({ before_ref: 'status:open', after_ref: 'status:active' }),
      expect.objectContaining({ before_ref: 'status:active', after_ref: 'status:closing' }),
      expect.objectContaining({ before_ref: 'status:closing', after_ref: 'status:closed' }),
      expect.objectContaining({ before_ref: 'status:closed', after_ref: 'status:archived' }),
    ]);
  });

  it('fails closed for invalid transitions and non-owner status changes', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const add = await addMember(baseUrl, ownerCookie, matterId);
    expect(add.status, await add.text()).toBe(201);

    const noOp = await updateStatus(baseUrl, ownerCookie, matterId, 'proposed');
    expect(noOp.status, await noOp.text()).toBe(400);

    const directClose = await updateStatus(baseUrl, ownerCookie, matterId, 'closed');
    expect(directClose.status, await directClose.text()).toBe(400);

    const memberDenied = await updateStatus(baseUrl, memberCookie, matterId, 'open');
    expect(memberDenied.status, await memberDenied.text()).toBe(403);

    const adminDenied = await updateStatus(baseUrl, firmAdminCookie, matterId, 'open');
    expect(adminDenied.status, await adminDenied.text()).toBe(403);

    const ownerAllowed = await updateStatus(baseUrl, ownerCookie, matterId, 'open');
    expect(ownerAllowed.status, await ownerAllowed.text()).toBe(200);

    await insertInvalidStatus(clientId);
  });

  it('blocks closed and archived matter member mutations after authorization', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const addBeforeClose = await addMember(baseUrl, ownerCookie, matterId);
    expect(addBeforeClose.status, await addBeforeClose.text()).toBe(201);

    for (const status of ['open', 'active', 'closing', 'closed']) {
      const response = await updateStatus(baseUrl, ownerCookie, matterId, status);
      expect(response.status, await response.text()).toBe(200);
    }

    const addClosed = await addMember(baseUrl, ownerCookie, matterId, alphaFirmAdminUserId);
    const addClosedBody = await addClosed.text();
    expect(addClosed.status, addClosedBody).toBe(400);
    expect(addClosedBody).toContain('MATTER_CLOSED');

    const roleClosed = await fetch(
      `${baseUrl}/v1/matters/${matterId}/members/${alphaMemberUserId}`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'edit' }),
      },
    );
    const roleClosedBody = await roleClosed.text();
    expect(roleClosed.status, roleClosedBody).toBe(400);
    expect(roleClosedBody).toContain('MATTER_CLOSED');

    const archive = await updateStatus(baseUrl, ownerCookie, matterId, 'archived');
    expect(archive.status, await archive.text()).toBe(200);

    const addArchived = await addMember(baseUrl, ownerCookie, matterId, alphaFirmAdminUserId);
    const addArchivedBody = await addArchived.text();
    expect(addArchived.status, addArchivedBody).toBe(400);
    expect(addArchivedBody).toContain('MATTER_CLOSED');
  });
});
