import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../apps/api/src/app.module';
import { configureApp } from '../../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../../apps/api/src/modules/auth/session.repository';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from '../helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';

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
    body: JSON.stringify({ name: `Break Glass Client ${randomUUID()}` }),
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
      matterCode: `BG-${randomUUID()}`,
      matterName: `Break Glass Matter ${randomUUID()}`,
      matterType: 'investigation',
      leadLawyerId: alphaOwnerUserId,
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return (JSON.parse(body) as { matterId: string }).matterId;
}

async function createWall(baseUrl: string, cookie: string, matterId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/ethical-walls`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      matterId,
      wallName: `Break Glass Wall ${randomUUID()}`,
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
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const parsed = JSON.parse(body) as { wall?: { wallId?: string }; wallId?: string };
  const wallId = parsed.wall?.wallId ?? parsed.wallId;
  if (!wallId) throw new Error(body);
  expect(wallId, body).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  return wallId;
}

async function requestBreakGlass(
  baseUrl: string,
  cookie: string,
  wallId: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/break-glass/requests`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      wallId,
      reasonCode: 'court_deadline',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('Z', '+00:00'),
    }),
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  const parsed = JSON.parse(body) as { requestId: string; status: string; approvalCount: number };
  expect(parsed.status).toBe('pending');
  expect(parsed.approvalCount).toBe(0);
  return parsed.requestId;
}

async function approve(
  baseUrl: string,
  cookie: string,
  requestId: string,
): Promise<{ status: string; approvalCount: number }> {
  const response = await fetch(`${baseUrl}/v1/break-glass/requests/${requestId}/approvals`, {
    method: 'POST',
    headers: { cookie },
  });
  const body = await response.text();
  expect(response.status, body).toBe(201);
  return JSON.parse(body) as { status: string; approvalCount: number };
}

async function requestAuditRows(requestId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      result: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT action, result, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND metadata_json->>'request_id' = $2
        ORDER BY seq ASC
      `,
      [tenantAlphaId, requestId],
    );
    return result.rows;
  });
}

describe('break glass dual approval integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ownerCookie: string;
  let securityAdminCookie: string;
  let firmAdminCookie: string;
  let clientId: string;

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
    firmAdminCookie = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    clientId = await createClient(baseUrl, ownerCookie);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires two non-requester approvers, audits use, and revokes the temporary override', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const wallId = await createWall(baseUrl, securityAdminCookie, matterId);

    const deniedBefore = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(deniedBefore.status, await deniedBefore.text()).toBe(403);

    const requestId = await requestBreakGlass(baseUrl, ownerCookie, wallId);

    const selfApproval = await fetch(`${baseUrl}/v1/break-glass/requests/${requestId}/approvals`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
    });
    expect(selfApproval.status, await selfApproval.text()).toBe(403);

    await expect(approve(baseUrl, securityAdminCookie, requestId)).resolves.toMatchObject({
      status: 'pending',
      approvalCount: 1,
    });

    const duplicateApproval = await fetch(
      `${baseUrl}/v1/break-glass/requests/${requestId}/approvals`,
      { method: 'POST', headers: { cookie: securityAdminCookie } },
    );
    expect(duplicateApproval.status, await duplicateApproval.text()).toBe(403);

    await expect(approve(baseUrl, firmAdminCookie, requestId)).resolves.toMatchObject({
      status: 'approved',
      approvalCount: 2,
    });

    const allowed = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(allowed.status, await allowed.text()).toBe(200);

    const revoke = await fetch(`${baseUrl}/v1/break-glass/requests/${requestId}/revoke`, {
      method: 'POST',
      headers: { cookie: securityAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'security_review' }),
    });
    const revokeBody = await revoke.text();
    expect(revoke.status, revokeBody).toBe(201);
    expect((JSON.parse(revokeBody) as { status: string }).status).toBe('revoked');

    const deniedAfterRevoke = await fetch(`${baseUrl}/v1/matters/${matterId}`, {
      headers: { cookie: ownerCookie },
    });
    expect(deniedAfterRevoke.status, await deniedAfterRevoke.text()).toBe(403);

    const audits = await requestAuditRows(requestId);
    expect(audits.map((row) => row.action)).toEqual([
      'BREAK_GLASS_REQUESTED',
      'ACCESS_DENIED',
      'BREAK_GLASS_APPROVED',
      'ACCESS_DENIED',
      'BREAK_GLASS_APPROVED',
      'BREAK_GLASS_ACTIVATED',
      'BREAK_GLASS_USED',
      'BREAK_GLASS_REVOKED',
    ]);
    for (const row of audits) {
      const serialized = JSON.stringify(row.metadata_json);
      expect(serialized).not.toContain('Break Glass Wall');
      expect(serialized).not.toContain('conflict_check');
      expect(serialized).not.toContain('body');
      expect(serialized).not.toContain('snippet');
    }
  });

  it('marks expired pending requests as denied evidence and keeps rows tenant scoped', async () => {
    const matterId = await createMatter(baseUrl, ownerCookie, clientId);
    const wallId = await createWall(baseUrl, securityAdminCookie, matterId);
    const requestId = await requestBreakGlass(baseUrl, ownerCookie, wallId);

    await withClient(createOwnerClient(), async (client) => {
      await client.query(
        `
          UPDATE break_glass_requests
          SET created_at = now() - interval '2 hours',
            expires_at = now() - interval '1 hour'
          WHERE tenant_id = $1
            AND request_id = $2
        `,
        [tenantAlphaId, requestId],
      );
    });

    const expiredApproval = await fetch(
      `${baseUrl}/v1/break-glass/requests/${requestId}/approvals`,
      { method: 'POST', headers: { cookie: securityAdminCookie } },
    );
    expect(expiredApproval.status, await expiredApproval.text()).toBe(403);

    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const result = await client.query(
        'SELECT request_id FROM break_glass_requests WHERE tenant_id = $1',
        [tenantAlphaId],
      );
      expect(result.rowCount).toBe(0);
    });

    const audits = await requestAuditRows(requestId);
    expect(audits.map((row) => row.action)).toEqual([
      'BREAK_GLASS_REQUESTED',
      'BREAK_GLASS_EXPIRED',
    ]);
  });
});
