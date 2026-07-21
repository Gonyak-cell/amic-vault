import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { MailerStub } from '../../apps/api/src/modules/auth/mailer.stub';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/modules/auth/session.repository';
import { PermissionService } from '../../apps/api/src/modules/permission/permission.service';
import { hashPassword } from '../../apps/api/src/modules/user/password';
import { createOwnerClient, tenantAlphaId, withClient } from './helpers/db';

const alphaFirmAdminUserId = '11111111-1111-4111-8111-111111111100';
const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaAuthResetUserId = '11111111-1111-4111-8111-111111111103';

function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

async function login(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<{ response: Response; cookie: string }> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const cookie = response.ok ? sessionCookie(response) : '';
  return { response, cookie };
}

async function loginRequired(
  baseUrl: string,
  input: { tenantId: string; email: string; password: string },
): Promise<string> {
  const { response, cookie } = await login(baseUrl, input);
  expect(response.status, await response.text()).toBe(201);
  return cookie;
}

async function resetLifecycleFixtures(): Promise<void> {
  const [adminHash, ownerHash, targetHash] = await Promise.all([
    hashPassword('dev-alpha-firm-admin-password'),
    hashPassword('dev-alpha-owner-password'),
    hashPassword('dev-alpha-auth-reset-password'),
  ]);

  await withClient(createOwnerClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `
          UPDATE users
          SET password_hash = data.password_hash,
              role = data.role,
              status = 'active',
              mfa_enabled = false,
              updated_at = now()
          FROM (
            VALUES
              ($1::uuid, $2::text, 'firm_admin'::text),
              ($3::uuid, $4::text, 'matter_owner'::text),
              ($5::uuid, $6::text, 'matter_member'::text)
          ) AS data(user_id, password_hash, role)
          WHERE users.tenant_id = $7
            AND users.user_id = data.user_id
        `,
        [
          alphaFirmAdminUserId,
          adminHash,
          alphaOwnerUserId,
          ownerHash,
          alphaAuthResetUserId,
          targetHash,
          tenantAlphaId,
        ],
      );
      await client.query(
        `
          UPDATE sessions
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND user_id IN ($2, $3, $4)
            AND revoked_at IS NULL
        `,
        [tenantAlphaId, alphaFirmAdminUserId, alphaOwnerUserId, alphaAuthResetUserId],
      );
      await client.query(
        `
          UPDATE password_reset_tokens
          SET used_at = COALESCE(used_at, now())
          WHERE tenant_id = $1
            AND user_id = $2
            AND used_at IS NULL
        `,
        [tenantAlphaId, alphaAuthResetUserId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function openResetTokenCount(userId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM password_reset_tokens
        WHERE tenant_id = $1
          AND user_id = $2
          AND used_at IS NULL
      `,
      [tenantAlphaId, userId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function setUserRole(
  userId: string,
  role: 'knowledge_manager' | 'matter_member',
): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE users
        SET role = $3,
            status = 'active',
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
      [tenantAlphaId, userId, role],
    );
  });
}

async function latestLifecycleAudit(userId: string, action: string) {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{
      action: string;
      actor_id: string | null;
      metadata_json: Record<string, unknown>;
    }>(
      `
        SELECT action, actor_id, metadata_json
        FROM audit_events
        WHERE tenant_id = $1
          AND action = $2
          AND target_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantAlphaId, action, userId],
    );
    return result.rows[0];
  });
}

describe('user offboarding integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mailer: MailerStub;
  let permissionService: PermissionService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    mailer = app.get(MailerStub);
    permissionService = app.get(PermissionService);
  });

  beforeEach(async () => {
    mailer.clear();
    await resetLifecycleFixtures();
  });

  afterAll(async () => {
    await resetLifecycleFixtures();
    await app.close();
  });

  it('deactivates a user, revokes active sessions and reset tokens, then reactivates login', async () => {
    const firmAdminCookie = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });
    const targetCookieOne = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });
    const targetCookieTwo = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });

    const userList = await fetch(`${baseUrl}/v1/users`, {
      headers: { cookie: firmAdminCookie },
    });
    const userListBody = await userList.text();
    expect(userList.status, userListBody).toBe(200);
    expect(JSON.parse(userListBody)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          userId: alphaAuthResetUserId,
          status: 'active',
        }),
      ]),
    });
    expect(userListBody).not.toContain('password_hash');
    expect(userListBody).not.toContain('passwordHash');

    const resetRequest = await fetch(`${baseUrl}/v1/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantAlphaId,
        email: 'alpha-auth-reset@test.local',
      }),
    });
    expect(resetRequest.status, await resetRequest.text()).toBe(201);
    expect(await openResetTokenCount(alphaAuthResetUserId)).toBe(1);
    expect(mailer.latestForEmail('alpha-auth-reset@test.local')).toBeDefined();

    const deactivate = await fetch(`${baseUrl}/v1/users/${alphaAuthResetUserId}/deactivate`, {
      method: 'POST',
      headers: { cookie: firmAdminCookie },
    });
    const deactivatedBody = await deactivate.text();
    expect(deactivate.status, deactivatedBody).toBe(200);
    expect(JSON.parse(deactivatedBody)).toMatchObject({
      userId: alphaAuthResetUserId,
      status: 'inactive',
    });

    for (const cookie of [targetCookieOne, targetCookieTwo]) {
      const currentUser = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: { cookie },
      });
      expect(currentUser.status, await currentUser.text()).toBe(401);
    }
    expect(await openResetTokenCount(alphaAuthResetUserId)).toBe(0);
    await expect(
      permissionService.canReadMatter(
        { tenantId: tenantAlphaId, userId: alphaAuthResetUserId },
        '11111111-1111-4111-8111-111111119999',
      ),
    ).resolves.toMatchObject({
      effect: 'DENY',
      appliedRules: expect.arrayContaining(['actor:inactive_or_missing']),
    });

    const deactivateAudit = await latestLifecycleAudit(alphaAuthResetUserId, 'USER_DEACTIVATED');
    expect(deactivateAudit?.actor_id).toBe(alphaFirmAdminUserId);
    expect(deactivateAudit?.metadata_json).toEqual({
      reason_code: 'admin_user_deactivated',
      status_before: 'active',
      status_after: 'inactive',
    });
    expect(JSON.stringify(deactivateAudit?.metadata_json)).not.toContain('alpha-auth-reset');

    const deniedLogin = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });
    expect(deniedLogin.response.status, await deniedLogin.response.text()).toBe(401);

    const reactivate = await fetch(`${baseUrl}/v1/users/${alphaAuthResetUserId}/reactivate`, {
      method: 'POST',
      headers: { cookie: firmAdminCookie },
    });
    const reactivatedBody = await reactivate.text();
    expect(reactivate.status, reactivatedBody).toBe(200);
    expect(JSON.parse(reactivatedBody)).toMatchObject({
      userId: alphaAuthResetUserId,
      status: 'active',
    });

    const reactivatedLogin = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });
    expect(reactivatedLogin.response.status, await reactivatedLogin.response.text()).toBe(201);

    const reactivateAudit = await latestLifecycleAudit(alphaAuthResetUserId, 'USER_REACTIVATED');
    expect(reactivateAudit?.actor_id).toBe(alphaFirmAdminUserId);
    expect(reactivateAudit?.metadata_json).toEqual({
      reason_code: 'admin_user_reactivated',
      status_before: 'inactive',
      status_after: 'active',
    });
  });

  it('blocks non-admin user lifecycle writes', async () => {
    const ownerCookie = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });

    const response = await fetch(`${baseUrl}/v1/users/${alphaAuthResetUserId}/deactivate`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
    });
    expect(response.status, await response.text()).toBe(403);

    const memberCookie = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });
    const memberDenied = await fetch(`${baseUrl}/v1/users/${alphaAuthResetUserId}/deactivate`, {
      method: 'POST',
      headers: { cookie: memberCookie },
    });
    expect(memberDenied.status, await memberDenied.text()).toBe(403);

    await setUserRole(alphaAuthResetUserId, 'knowledge_manager');
    const knowledgeManagerCookie = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });
    const knowledgeManagerDenied = await fetch(
      `${baseUrl}/v1/users/${alphaAuthResetUserId}/deactivate`,
      {
        method: 'POST',
        headers: { cookie: knowledgeManagerCookie },
      },
    );
    expect(knowledgeManagerDenied.status, await knowledgeManagerDenied.text()).toBe(403);
  });

  it('blocks deactivation of the last active firm admin', async () => {
    const firmAdminCookie = await loginRequired(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });

    const response = await fetch(`${baseUrl}/v1/users/${alphaFirmAdminUserId}/deactivate`, {
      method: 'POST',
      headers: { cookie: firmAdminCookie },
    });
    const body = await response.text();
    expect(response.status, body).toBe(409);
    expect(body).toContain('last_active_firm_admin');
  });
});
