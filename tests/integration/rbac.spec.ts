import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaRbacTargetUserId = '11111111-1111-4111-8111-111111111104';

async function login(
  baseUrl: string,
  input: { tenantId?: string; email?: string; accountLedgerId?: string; password: string },
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

async function latestRoleAudit(targetUserId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      metadata_json: Record<string, unknown>;
      actor_id: string | null;
    }>(
      `
        SELECT action, metadata_json, actor_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ROLE_CHANGED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, targetUserId],
    );
    return result.rows[0];
  });
}

async function latestAccountLedgerAudit(targetUserId: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      metadata_json: Record<string, unknown>;
      actor_id: string | null;
    }>(
      `
        SELECT action, metadata_json, actor_id
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ACCOUNT_LEDGER_ID_ASSIGNED'
          AND target_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, targetUserId],
    );
    return result.rows[0];
  });
}

async function roleAuditCount(targetUserId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND action = 'ROLE_CHANGED'
          AND target_id = $2
      `,
      [tenantAlphaId, targetUserId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

describe('rbac integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let firmAdminCookie: string;
  let securityAdminCookie: string;
  let ownerCookie: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns tenant-local roles with reference-only audit metadata', async () => {
    const response = await fetch(`${baseUrl}/v1/users/${alphaRbacTargetUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'limited_reviewer' }),
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      userId: alphaRbacTargetUserId,
      role: 'limited_reviewer',
    });

    const audit = await latestRoleAudit(alphaRbacTargetUserId);
    expect(audit?.actor_id).toBe(alphaFirmAdminUserId);
    expect(audit?.metadata_json).toEqual({
      role_before: 'matter_member',
      role_after: 'limited_reviewer',
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('alpha-rbac-target@test.local');

    const beforeNoop = await roleAuditCount(alphaRbacTargetUserId);
    const noop = await fetch(`${baseUrl}/v1/users/${alphaRbacTargetUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'limited_reviewer' }),
    });
    expect(noop.status, await noop.text()).toBe(200);
    await expect(roleAuditCount(alphaRbacTargetUserId)).resolves.toBe(beforeNoop);
  });

  it('blocks non-admin role writes, external_user assignment, and admin settings leakage', async () => {
    const ownerDenied = await fetch(`${baseUrl}/v1/users/${alphaRbacTargetUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'matter_member' }),
    });
    expect(ownerDenied.status, await ownerDenied.text()).toBe(403);

    const externalDenied = await fetch(`${baseUrl}/v1/users/${alphaRbacTargetUserId}/role`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'external_user' }),
    });
    expect(externalDenied.status, await externalDenied.text()).toBe(403);

    const tenantSettingsDenied = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { cookie: ownerCookie },
    });
    expect(tenantSettingsDenied.status, await tenantSettingsDenied.text()).toBe(403);

    const tenantSettingsAllowed = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { cookie: securityAdminCookie },
    });
    expect(tenantSettingsAllowed.status, await tenantSettingsAllowed.text()).toBe(200);
  });

  it('assigns account ledger ids with reference-only audit metadata and login access', async () => {
    const accountLedgerId = 'acct-rbac-target-login';
    const response = await fetch(`${baseUrl}/v1/users/${alphaRbacTargetUserId}/account-ledger-id`, {
      method: 'PATCH',
      headers: { cookie: firmAdminCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accountLedgerId }),
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      userId: alphaRbacTargetUserId,
      email: 'alpha-rbac-target@test.local',
    });

    const audit = await latestAccountLedgerAudit(alphaRbacTargetUserId);
    expect(audit?.actor_id).toBe(alphaFirmAdminUserId);
    expect(audit?.metadata_json).toEqual({
      identity_type: 'account_ledger_id',
      target_user_id: alphaRbacTargetUserId,
    });
    expect(JSON.stringify(audit?.metadata_json)).not.toContain(accountLedgerId);
    expect(JSON.stringify(audit?.metadata_json)).not.toContain('alpha-rbac-target@test.local');

    const ledgerCookie = await login(baseUrl, {
      accountLedgerId: accountLedgerId.toUpperCase(),
      password: 'dev-alpha-rbac-target-password',
    });
    const currentUser = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { cookie: ledgerCookie },
    });
    expect(currentUser.status, await currentUser.text()).toBe(200);

    const ownerDenied = await fetch(
      `${baseUrl}/v1/users/${alphaRbacTargetUserId}/account-ledger-id`,
      {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ accountLedgerId: 'acct-owner-denied-login' }),
      },
    );
    expect(ownerDenied.status, await ownerDenied.text()).toBe(403);
  });
});
