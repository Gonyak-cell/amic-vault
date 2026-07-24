import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { MailerStub } from '../../apps/api/src/modules/auth/mailer.stub';
import {
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
} from '../../apps/api/src/modules/auth/session.repository';
import { totpCodeForSecret } from '../../apps/api/src/modules/auth/totp.service';
import { createAppClient, createOwnerClient, tenantBetaId, withClient } from './helpers/db';

const betaAuthMfaUserId = '22222222-2222-4222-8222-222222222203';
const betaAuthMfaEmail = 'beta-auth-mfa@test.local';
const betaAuthMfaPassword = 'dev-beta-auth-mfa-password';

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
): Promise<{ response: Response; body: string; cookie: string }> {
  return loginWithPassword(baseUrl, betaAuthMfaPassword);
}

async function loginWithPassword(
  baseUrl: string,
  password: string,
): Promise<{ response: Response; body: string; cookie: string }> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantBetaId,
      email: betaAuthMfaEmail,
      password,
    }),
  });
  const body = await response.text();
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, body, cookie: setCookie ? extractSessionCookie(response) : '' };
}

interface AuthThrottleRow {
  throttle_scope: string;
  reference_hash: string;
  failure_count: number;
  window_started_at: Date;
  next_allowed_at: Date;
  locked_until: Date | null;
  updated_at: Date;
}

async function clearAuthThrottleState(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query('DELETE FROM auth_throttle_states');
  });
}

async function authThrottleRows(): Promise<AuthThrottleRow[]> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<AuthThrottleRow>(
      `
        SELECT throttle_scope, reference_hash, failure_count, next_allowed_at, locked_until
             , window_started_at, updated_at
        FROM auth_throttle_states
        ORDER BY throttle_scope ASC
      `,
    );
    return result.rows;
  });
}

async function advanceAuthThrottleWindows(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE auth_throttle_states
        SET next_allowed_at = clock_timestamp() - interval '1 second'
        WHERE locked_until IS NULL
      `,
    );
  });
}

async function expireAuthThrottleState(scopes?: readonly string[]): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query(
      `
        UPDATE auth_throttle_states
        SET window_started_at = clock_timestamp() - interval '16 minutes',
            next_allowed_at = clock_timestamp() - interval '1 second',
            locked_until = clock_timestamp() - interval '1 second'
        ${scopes ? 'WHERE throttle_scope = ANY($1::text[])' : ''}
      `,
      scopes ? [scopes] : [],
    );
  });
}

async function requestPasswordReset(baseUrl: string): Promise<{ response: Response; body: string }> {
  const response = await fetch(`${baseUrl}/v1/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: tenantBetaId, email: betaAuthMfaEmail }),
  });
  return { response, body: await response.text() };
}

async function runtimeThrottleCall(
  query: string,
  params: readonly unknown[],
): Promise<{ allowed: boolean }> {
  return withClient(createAppClient(), async (client) => {
    const result = await client.query<{ allowed: boolean }>(query, [...params]);
    const row = result.rows[0];
    if (!row) throw new Error('AUTH_THROTTLE_RESULT_MISSING');
    return row;
  });
}

async function resetMfaUser(): Promise<void> {
  await withClient(createOwnerClient(), async (client) => {
    await client.query('DELETE FROM mfa_challenges WHERE user_id = $1', [betaAuthMfaUserId]);
    await client.query('DELETE FROM mfa_secrets WHERE user_id = $1', [betaAuthMfaUserId]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [betaAuthMfaUserId]);
    await client.query('UPDATE users SET mfa_enabled = false WHERE user_id = $1', [
      betaAuthMfaUserId,
    ]);
  });
}

async function sessionMfaVerified(cookie: string): Promise<boolean | null> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ mfa_verified: boolean }>(
      'SELECT mfa_verified FROM sessions WHERE token_hash = $1',
      [hashOpaqueToken(extractSessionToken(cookie))],
    );
    return result.rows[0]?.mfa_verified ?? null;
  });
}

async function challengeState(
  challengeId: string,
): Promise<{ attempt_count: number; locked_at: Date | null } | null> {
  const separatorIndex = challengeId.indexOf('.');
  const tenantId = challengeId.slice(0, separatorIndex);
  const token = challengeId.slice(separatorIndex + 1);
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ attempt_count: number; locked_at: Date | null }>(
      `
        SELECT attempt_count, locked_at
        FROM mfa_challenges
        WHERE tenant_id = $1
          AND challenge_token_hash = $2
      `,
      [tenantId, hashOpaqueToken(token)],
    );
    return result.rows[0] ?? null;
  });
}

async function auditCount(action: string): Promise<number> {
  return withClient(createOwnerClient(), async (client) => {
    const result = await client.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE tenant_id = $1
          AND target_id = $2
          AND action = $3
      `,
      [tenantBetaId, betaAuthMfaUserId, action],
    );
    return Number(result.rows[0]?.count ?? '0');
  });
}

async function verifyMfa(baseUrl: string, challengeId: string, code: string): Promise<Response> {
  return fetch(`${baseUrl}/v1/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
}

async function enrollAndActivateMfa(baseUrl: string): Promise<MfaEnrollmentFixture> {
  const initial = await login(baseUrl);
  expect(initial.response.status, initial.body).toBe(201);

  const enroll = await fetch(`${baseUrl}/v1/auth/mfa/enroll`, {
    method: 'POST',
    headers: { cookie: initial.cookie },
  });
  const enrollBody = await enroll.text();
  expect(enroll.status, enrollBody).toBe(201);
  const enrolled = JSON.parse(enrollBody) as MfaEnrollmentFixture;
  const otpUrl = new URL(enrolled.otpauthUri);
  expect(otpUrl.protocol).toBe('otpauth:');
  expect(otpUrl.hostname).toBe('totp');
  expect(otpUrl.searchParams.get('secret')).toBe(enrolled.manualEntryKey);
  expect(enrolled.recoveryCodes).toHaveLength(8);

  const activate = await fetch(`${baseUrl}/v1/auth/mfa/activate`, {
    method: 'POST',
    headers: { cookie: initial.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      secretId: enrolled.secretId,
      code: totpCodeForSecret(enrolled.manualEntryKey),
    }),
  });
  expect(activate.status, await activate.text()).toBe(201);
  return enrolled;
}

interface MfaEnrollmentFixture {
  secretId: string;
  manualEntryKey: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

describe('auth MFA integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mailer: MailerStub;
  const previousMfaSecretEncryptionKey = process.env.MFA_SECRET_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.MFA_SECRET_ENCRYPTION_KEY = 'integration-test-mfa-secret-key';
    await clearAuthThrottleState();
    await resetMfaUser();
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    mailer = app.get(MailerStub);
  });

  beforeEach(async () => {
    mailer.clear();
    await clearAuthThrottleState();
    await resetMfaUser();
  });

  afterAll(async () => {
    await clearAuthThrottleState();
    await resetMfaUser();
    await app.close();
    if (previousMfaSecretEncryptionKey === undefined) {
      delete process.env.MFA_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.MFA_SECRET_ENCRYPTION_KEY = previousMfaSecretEncryptionKey;
    }
  });

  it('enrolls TOTP, activates MFA, completes mfa_pending login, and records success audit', async () => {
    const enrolled = await enrollAndActivateMfa(baseUrl);

    const challenged = await login(baseUrl);
    expect(challenged.response.status, challenged.body).toBe(201);
    expect(challenged.response.headers.get('set-cookie') ?? '').toBe('');
    const challenge = JSON.parse(challenged.body) as {
      mfaRequired: true;
      mfaChallengeId: string;
    };
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.mfaChallengeId).toContain(`${tenantBetaId}.`);

    const verified = await verifyMfa(
      baseUrl,
      challenge.mfaChallengeId,
      totpCodeForSecret(enrolled.manualEntryKey),
    );
    const verifiedBody = await verified.text();
    expect(verified.status, verifiedBody).toBe(201);
    const verifiedCookie = extractSessionCookie(verified);
    await expect(sessionMfaVerified(verifiedCookie)).resolves.toBe(true);
    await expect(auditCount('MFA_ENROLLED')).resolves.toBeGreaterThanOrEqual(1);
    await expect(auditCount('MFA_CHALLENGE_SUCCEEDED')).resolves.toBeGreaterThanOrEqual(1);
  });

  it('locks a challenge after 5 invalid codes and records failure audit rows', async () => {
    const enrolled = await enrollAndActivateMfa(baseUrl);
    const challenged = await login(baseUrl);
    expect(challenged.response.status, challenged.body).toBe(201);
    const challenge = JSON.parse(challenged.body) as {
      mfaRequired: true;
      mfaChallengeId: string;
    };
    const beforeFailures = await auditCount('MFA_CHALLENGE_FAILED');
    const invalidCode =
      totpCodeForSecret(enrolled.manualEntryKey) === '000000' ? '000001' : '000000';

    for (let index = 0; index < 5; index += 1) {
      const failed = await verifyMfa(baseUrl, challenge.mfaChallengeId, invalidCode);
      const failedBody = await failed.text();
      expect(failed.status, failedBody).toBe(401);
      expect(failedBody).toContain('AUTH_REQUIRED');
      if (index < 4) await advanceAuthThrottleWindows();
    }

    await expect(challengeState(challenge.mfaChallengeId)).resolves.toMatchObject({
      attempt_count: 5,
      locked_at: expect.any(Date),
    });
    await expect(auditCount('MFA_CHALLENGE_FAILED')).resolves.toBeGreaterThanOrEqual(
      beforeFailures + 5,
    );
  });

  it('stores only HMAC references, enforces database-clock backoff, and locks after five invalid login attempts', async () => {
    const invalidPassword = `${betaAuthMfaPassword}-invalid`;
    const expectedBackoffSeconds = [1, 2, 4, 8, 15 * 60];

    for (let index = 0; index < 5; index += 1) {
      const failed = await loginWithPassword(baseUrl, invalidPassword);
      expect(failed.response.status, failed.body).toBe(401);
      expect(failed.body).toContain('AUTH_REQUIRED');
      const rowsAfterFailure = await authThrottleRows();
      expect(rowsAfterFailure).toHaveLength(2);
      for (const row of rowsAfterFailure) {
        expect(row.failure_count).toBe(index + 1);
        expect(
          Math.round((row.next_allowed_at.getTime() - row.updated_at.getTime()) / 1_000),
        ).toBe(expectedBackoffSeconds[index]);
      }
      if (index < 4) await advanceAuthThrottleWindows();
    }

    const rows = await authThrottleRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.throttle_scope)).toEqual(['login_account', 'login_network']);
    for (const row of rows) {
      expect(row.reference_hash).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
      expect(row.failure_count).toBe(5);
      expect(row.locked_until).toBeInstanceOf(Date);
      expect(row.next_allowed_at.getTime()).toBeGreaterThan(Date.now());
    }
    const persisted = JSON.stringify(rows);
    expect(persisted).not.toContain(betaAuthMfaEmail);
    expect(persisted).not.toContain(invalidPassword);
    expect(persisted).not.toContain('127.0.0.1');

    const locked = await login(baseUrl);
    expect(locked.response.status, locked.body).toBe(401);
    expect(locked.body).toContain('AUTH_REQUIRED');
    await expireAuthThrottleState(['login_account', 'login_network']);
    const recovered = await login(baseUrl);
    expect(recovered.response.status, recovered.body).toBe(201);
    await expect(authThrottleRows()).resolves.toEqual([]);
    await expect(
      withClient(createAppClient(), (client) =>
        client.query('SELECT throttle_scope FROM auth_throttle_states'),
      ),
    ).rejects.toThrow(/permission denied/u);
  });

  it('consumes reset attempts without an outward oracle and resumes after database-clock expiry', async () => {
    const first = await requestPasswordReset(baseUrl);
    expect(first.response.status, first.body).toBe(201);
    expect(first.body).toBe(JSON.stringify({ accepted: true }));
    expect(mailer.sentMessages()).toHaveLength(1);

    const consumedRows = await authThrottleRows();
    expect(consumedRows.map((row) => row.throttle_scope)).toEqual([
      'reset_account',
      'reset_network',
    ]);
    expect(consumedRows.every((row) => row.failure_count === 1)).toBe(true);

    const throttled = await requestPasswordReset(baseUrl);
    expect(throttled.response.status, throttled.body).toBe(201);
    expect(throttled.body).toBe(first.body);
    expect(mailer.sentMessages()).toHaveLength(1);

    await expireAuthThrottleState(['reset_account', 'reset_network']);
    const afterExpiry = await requestPasswordReset(baseUrl);
    expect(afterExpiry.response.status, afterExpiry.body).toBe(201);
    expect(afterExpiry.body).toBe(first.body);
    expect(mailer.sentMessages()).toHaveLength(2);
  });

  it('keeps existing and missing login candidates externally identical', async () => {
    const existing = await loginWithPassword(baseUrl, `${betaAuthMfaPassword}-invalid`);
    const missingResponse = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantBetaId,
        email: 'missing-auth-throttle@test.local',
        password: `${betaAuthMfaPassword}-invalid`,
      }),
    });
    const missingBody = await missingResponse.text();

    expect(existing.response.status, existing.body).toBe(401);
    expect(missingResponse.status, missingBody).toBe(existing.response.status);
    expect(JSON.parse(missingBody)).toEqual({
      code: JSON.parse(existing.body).code,
      requestId: expect.any(String),
    });
    expect(JSON.parse(existing.body)).toEqual({
      code: 'AUTH_REQUIRED',
      requestId: expect.any(String),
    });
    expect(missingBody).not.toContain('missing-auth-throttle@test.local');
  });

  it('serializes concurrent runtime-role failures and validates the narrow function input', async () => {
    const reference = `hmac-sha256:${'a'.repeat(64)}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        runtimeThrottleCall('SELECT app_auth_throttle_record_failure($1, $2) AS allowed', [
          'login_account',
          reference,
        ]),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(await runtimeThrottleCall('SELECT app_auth_throttle_check($1, $2) AS allowed', [
      'login_account',
      reference,
    ])).toEqual({ allowed: false });

    const rows = await authThrottleRows();
    expect(rows).toEqual([
      expect.objectContaining({
        throttle_scope: 'login_account',
        reference_hash: reference,
        failure_count: 5,
        locked_until: expect.any(Date),
      }),
    ]);
    await expect(
      runtimeThrottleCall('SELECT app_auth_throttle_check($1, $2) AS allowed', [
        'not_a_scope',
        reference,
      ]),
    ).rejects.toThrow(/AUTH_THROTTLE_INPUT_INVALID/u);
    await expect(
      runtimeThrottleCall('SELECT app_auth_throttle_check($1, $2) AS allowed', [
        'login_account',
        null,
      ]),
    ).rejects.toThrow(/AUTH_THROTTLE_INPUT_INVALID/u);
  });
});
