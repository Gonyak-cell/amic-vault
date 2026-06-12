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

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaSecurityAdminUserId = '11111111-1111-4111-8111-111111111110';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaMemberUserId = '11111111-1111-4111-8111-111111111102';
const betaOwnerUserId = '22222222-2222-4222-8222-222222222201';

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

async function insertAuditFixture(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, actor_id, action, target_type, target_id, result,
          metadata_json, created_at
        )
        VALUES
          ($1, $2, 'ACCESS_DENIED', 'user', $3, 'denied', $4::jsonb, $5::timestamptz),
          ($1, $6, 'LOGIN_SUCCESS', 'user', $6, 'success', '{}'::jsonb, $7::timestamptz)
      `,
      [
        tenantAlphaId,
        alphaSecurityAdminUserId,
        alphaMemberUserId,
        JSON.stringify({ reason_code: 'PERMISSION_DENIED' }),
        '2026-06-12T00:00:00.000Z',
        alphaFirmAdminUserId,
        '2026-06-12T00:01:00.000Z',
      ],
    );
  });
}

async function latestAuditConsoleAction(action: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      actor_id: string | null;
      target_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT action, actor_id, target_type, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, action],
    );
    return result.rows[0];
  });
}

describe('audit console integration', () => {
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
    await insertAuditFixture();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows admin audit search with bounded actor action date and target filters', async () => {
    const params = new URLSearchParams({
      actorId: alphaSecurityAdminUserId,
      action: 'ACCESS_DENIED',
      result: 'denied',
      targetType: 'user',
      targetId: alphaMemberUserId,
      from: '2026-06-12T00:00:00.000Z',
      to: '2026-06-13T00:00:00.000Z',
      limit: '20',
    });

    const response = await fetch(`${baseUrl}/v1/audit-events?${params.toString()}`, {
      headers: { cookie: securityAdminCookie },
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    const parsed = JSON.parse(body) as {
      items: Array<{
        action: string;
        actorId: string | null;
        targetType: string;
        targetId: string | null;
        metadata: Record<string, unknown>;
      }>;
    };
    expect(parsed.items.length).toBeGreaterThanOrEqual(1);
    for (const item of parsed.items) {
      expect(item).toMatchObject({
        action: 'ACCESS_DENIED',
        actorId: alphaSecurityAdminUserId,
        targetType: 'user',
        targetId: alphaMemberUserId,
      });
      expect(JSON.stringify(item.metadata)).not.toContain('password');
      expect(JSON.stringify(item.metadata)).not.toContain('token');
    }

    const queryAudit = await latestAuditConsoleAction('AUDIT_QUERY_EXECUTED');
    expect(queryAudit).toMatchObject({
      action: 'AUDIT_QUERY_EXECUTED',
      actor_id: alphaSecurityAdminUserId,
      target_type: 'audit_console',
    });
    expect(JSON.stringify(queryAudit?.metadata_json)).not.toContain('password');
    expect(JSON.stringify(queryAudit?.metadata_json)).not.toContain('token');
  });

  it('blocks non-admin and cross-tenant target filters with safe denial', async () => {
    const nonAdmin = await fetch(`${baseUrl}/v1/audit-events?limit=1`, {
      headers: { cookie: ownerCookie },
    });
    const nonAdminBody = await nonAdmin.text();
    expect(nonAdmin.status, nonAdminBody).toBe(403);
    expect(nonAdminBody).toContain('PERMISSION_DENIED');

    const crossTenant = await fetch(
      `${baseUrl}/v1/audit-events?targetType=user&targetId=${betaOwnerUserId}`,
      { headers: { cookie: firmAdminCookie } },
    );
    const crossTenantBody = await crossTenant.text();
    expect(crossTenant.status, crossTenantBody).toBe(404);
    expect(crossTenantBody).toContain('PERMISSION_DENIED');
  });

  it('exports whitelist-only CSV and records an export audit', async () => {
    const params = new URLSearchParams({
      action: 'ACCESS_DENIED',
      targetType: 'user',
      targetId: alphaMemberUserId,
      limit: '50',
    });
    const response = await fetch(`${baseUrl}/v1/audit-events/export.csv?${params.toString()}`, {
      headers: { cookie: firmAdminCookie },
    });
    const csv = await response.text();
    expect(response.status, csv).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(csv.split('\n')[0]).toBe(
      'event_id,created_at,action,result,actor_type,actor_id,target_type,target_id,matter_id,session_id',
    );
    expect(csv).toContain('ACCESS_DENIED');
    expect(csv).not.toContain('metadata_json');
    expect(csv).not.toContain('reason_code');

    const exportAudit = await latestAuditConsoleAction('AUDIT_EXPORT_CREATED');
    expect(exportAudit).toMatchObject({
      action: 'AUDIT_EXPORT_CREATED',
      actor_id: alphaFirmAdminUserId,
      target_type: 'audit_export',
    });
    expect(exportAudit?.metadata_json).toMatchObject({
      export_format: 'csv',
      scope_type: 'tenant_audit',
    });
  });
});

describe('sharing policy definition only integration', () => {
  it('keeps R11 sharing policy definitions controlled and tenant-scoped', async () => {
    await withClient(createAppClient(), async (client) => {
      await setTenant(client, tenantBetaId);
      const policyKey = `external_sharing`;
      await client.query(
        `
          INSERT INTO sharing_policy_definitions (tenant_id, policy_key)
          VALUES ($1, $2)
          ON CONFLICT (tenant_id, policy_key) DO UPDATE
            SET updated_at = now()
        `,
        [tenantBetaId, policyKey],
      );
      const betaRows = await client.query(
        `
          SELECT tenant_id, policy_key, status, enforcement_mode
          FROM sharing_policy_definitions
          WHERE policy_key = $1
        `,
        [policyKey],
      );
      expect(betaRows.rows).toEqual([
        {
          tenant_id: tenantBetaId,
          policy_key: policyKey,
          status: 'enabled_r11',
          enforcement_mode: 'controlled_allow',
        },
      ]);

      await expect(
        client.query(
          `
            INSERT INTO sharing_policy_definitions (
              policy_id, tenant_id, policy_key, status, enforcement_mode
            )
            VALUES ($1, $2, 'secure_link', 'enabled', 'allow_configured')
          `,
          [randomUUID(), tenantBetaId],
        ),
      ).rejects.toThrow();

      await setTenant(client, tenantAlphaId);
      const alphaRows = await client.query(
        `
          SELECT tenant_id, policy_key, status, enforcement_mode
          FROM sharing_policy_definitions
          ORDER BY policy_key
        `,
      );
      expect(alphaRows.rows).toEqual([
        {
          tenant_id: tenantAlphaId,
          policy_key: 'external_sharing',
          status: 'enabled_r11',
          enforcement_mode: 'controlled_allow',
        },
        {
          tenant_id: tenantAlphaId,
          policy_key: 'external_user_access',
          status: 'enabled_r11',
          enforcement_mode: 'controlled_allow',
        },
        {
          tenant_id: tenantAlphaId,
          policy_key: 'secure_link',
          status: 'enabled_r11',
          enforcement_mode: 'controlled_allow',
        },
      ]);
    });
  });
});
