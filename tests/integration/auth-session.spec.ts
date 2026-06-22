import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { MailerStub } from '../../apps/api/src/modules/auth/mailer.stub';
import {
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
} from '../../apps/api/src/modules/auth/session.repository';
import {
  createAppClient,
  createOwnerClient,
  setTenant,
  tenantAlphaId,
  tenantBetaId,
  withClient,
} from './helpers/db';

const alphaOwnerUserId = '11111111-1111-4111-8111-111111111101';
const alphaAuthResetUserId = '11111111-1111-4111-8111-111111111103';
const betaAuthMfaUserId = '22222222-2222-4222-8222-222222222203';
const alphaOwnerAccountLedgerId = 'acct-alpha-owner-login';

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
  return cookie;
}

function extractSessionToken(cookie: string): string {
  return cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
}

async function login(
  baseUrl: string,
  input: {
    tenantId?: string;
    email?: string;
    accountLedgerId?: string;
    password: string;
  },
): Promise<{ response: Response; cookie: string }> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const cookie = response.ok ? extractSessionCookie(response) : '';
  return { response, cookie };
}

async function setMfaEnabled(userId: string, enabled: boolean): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query('UPDATE users SET mfa_enabled = $2 WHERE user_id = $1', [userId, enabled]);
  });
}

async function assignAccountLedgerId(userId: string, accountLedgerId: string): Promise<void> {
  await withClient(createAppClient(), async (client) => {
    await client.query('BEGIN');
    try {
      await setTenant(client, tenantAlphaId);
      await client.query(
        `
          INSERT INTO user_login_identities (
            tenant_id, user_id, identity_type, identity_value_normalized
          )
          VALUES ($1, $2, 'account_ledger_id', $3)
          ON CONFLICT (tenant_id, user_id, identity_type)
          DO UPDATE SET
            identity_value_normalized = EXCLUDED.identity_value_normalized,
            status = 'active',
            updated_at = now()
        `,
        [tenantAlphaId, userId, accountLedgerId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function countSessionsForUser(userId: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM sessions WHERE user_id = $1',
      [userId],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function expireSession(cookie: string): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query('UPDATE sessions SET expires_at = now() WHERE token_hash = $1', [
      hashOpaqueToken(extractSessionToken(cookie)),
    ]);
  });
}

async function latestResetHash(userId: string): Promise<string> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ token_hash: string }>(
      `
        SELECT token_hash
        FROM password_reset_tokens
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    );
    return result.rows[0]?.token_hash ?? '';
  });
}

describe('auth session integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mailer: MailerStub;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    mailer = app.get(MailerStub);
    await assignAccountLedgerId(alphaOwnerUserId, alphaOwnerAccountLedgerId);
  });

  afterAll(async () => {
    await setMfaEnabled(betaAuthMfaUserId, false);
    await app.close();
  });

  it('logs in with httpOnly SameSite=Lax cookie and rejects invalid identities uniformly', async () => {
    const { response } = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });

    expect(response.status).toBe(201);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const failures = [
      { tenantId: tenantAlphaId, email: 'alpha-matter-owner@test.local', password: 'wrong' },
      { tenantId: tenantAlphaId, email: 'missing@test.local', password: 'wrong' },
      {
        tenantId: '33333333-3333-4333-8333-333333333333',
        email: 'missing@test.local',
        password: 'wrong',
      },
    ];

    for (const failure of failures) {
      const failed = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(failure),
      });
      const body = await failed.text();
      expect(failed.status, body).toBe(401);
      expect(body).toContain('AUTH_REQUIRED');
      expect(body).not.toContain('missing@test.local');
      expect(body).not.toContain('alpha-matter-owner@test.local');
    }
  });

  it('logs in with a global account ledger id without a tenant hint', async () => {
    const { response, cookie } = await login(baseUrl, {
      accountLedgerId: alphaOwnerAccountLedgerId.toUpperCase(),
      password: 'dev-alpha-owner-password',
    });

    expect(response.status).toBe(201);

    const currentUser = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { cookie },
    });
    const body = await currentUser.text();

    expect(currentUser.status, body).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      user: {
        email: 'alpha-matter-owner@test.local',
      },
    });
  });

  it('uses the session tenant as the only protected endpoint tenant source', async () => {
    const { cookie } = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-firm-admin@test.local',
      password: 'dev-alpha-firm-admin-password',
    });

    const response = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: {
        cookie,
        'x-tenant-id': tenantBetaId,
      },
    });
    const body = await response.text();

    expect(response.status, body).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      tenantId: tenantAlphaId,
      slug: 'tenant-alpha',
    });
    expect(body).not.toContain(tenantBetaId);
  });

  it('rejects no-session, expired-session, and logout-revoked access', async () => {
    const missing = await fetch(`${baseUrl}/v1/tenant/settings`);
    expect(missing.status).toBe(401);

    const loginResult = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    await expireSession(loginResult.cookie);
    const expired = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { cookie: loginResult.cookie },
    });
    expect(expired.status).toBe(401);

    const fresh = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-matter-owner@test.local',
      password: 'dev-alpha-owner-password',
    });
    const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: fresh.cookie },
    });
    expect(logout.status).toBe(201);

    const revoked = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { cookie: fresh.cookie },
    });
    expect(revoked.status).toBe(401);
  });

  it('fails closed for mfa_enabled users without creating a session', async () => {
    await setMfaEnabled(betaAuthMfaUserId, true);
    try {
      const before = await countSessionsForUser(betaAuthMfaUserId);

      const response = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantBetaId,
          email: 'beta-auth-mfa@test.local',
          password: 'dev-beta-auth-mfa-password',
        }),
      });
      const body = await response.text();
      const after = await countSessionsForUser(betaAuthMfaUserId);

      expect(response.status, body).toBe(401);
      expect(body).toContain('AUTH_REQUIRED');
      expect(body).toContain('mfa_not_available');
      expect(after).toBe(before);
    } finally {
      await setMfaEnabled(betaAuthMfaUserId, false);
    }
  });

  it('completes password reset without storing plaintext tokens and revokes old sessions', async () => {
    mailer.clear();
    const oldSession = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'dev-alpha-auth-reset-password',
    });

    const request = await fetch(`${baseUrl}/v1/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: tenantAlphaId, email: 'alpha-auth-reset@test.local' }),
    });
    expect(request.status).toBe(201);

    const message = mailer.latestForEmail('alpha-auth-reset@test.local');
    expect(message).toBeDefined();
    const storedHash = await latestResetHash(alphaAuthResetUserId);
    expect(storedHash).toBe(hashOpaqueToken(message?.token ?? ''));
    expect(storedHash).not.toContain(message?.token ?? '');

    const confirm = await fetch(`${baseUrl}/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: message?.token, password: 'new-alpha-member-password' }),
    });
    expect(confirm.status).toBe(201);

    const oldPassword = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantAlphaId,
        email: 'alpha-auth-reset@test.local',
        password: 'dev-alpha-auth-reset-password',
      }),
    });
    expect(oldPassword.status).toBe(401);

    const oldCookieAccess = await fetch(`${baseUrl}/v1/tenant/settings`, {
      headers: { cookie: oldSession.cookie },
    });
    expect(oldCookieAccess.status).toBe(401);

    const newPassword = await login(baseUrl, {
      tenantId: tenantAlphaId,
      email: 'alpha-auth-reset@test.local',
      password: 'new-alpha-member-password',
    });
    expect(newPassword.response.status).toBe(201);

    const reused = await fetch(`${baseUrl}/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: message?.token, password: 'another-password' }),
    });
    expect(reused.status).toBe(401);

    const fake = await fetch(`${baseUrl}/v1/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'fake-token', password: 'another-password' }),
    });
    expect(fake.status).toBe(401);
  });
});
