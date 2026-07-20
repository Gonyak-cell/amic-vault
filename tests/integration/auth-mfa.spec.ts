import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import {
  hashOpaqueToken,
  SESSION_COOKIE_NAME,
} from '../../apps/api/src/modules/auth/session.repository';
import { totpCodeForSecret } from '../../apps/api/src/modules/auth/totp.service';
import { createOwnerClient, tenantBetaId, withClient } from './helpers/db';

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
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId: tenantBetaId,
      email: betaAuthMfaEmail,
      password: betaAuthMfaPassword,
    }),
  });
  const body = await response.text();
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { response, body, cookie: setCookie ? extractSessionCookie(response) : '' };
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
  const previousMfaSecretEncryptionKey = process.env.MFA_SECRET_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.MFA_SECRET_ENCRYPTION_KEY = 'integration-test-mfa-secret-key';
    await resetMfaUser();
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  beforeEach(async () => {
    await resetMfaUser();
  });

  afterAll(async () => {
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
    }

    await expect(challengeState(challenge.mfaChallengeId)).resolves.toMatchObject({
      attempt_count: 5,
      locked_at: expect.any(Date),
    });
    await expect(auditCount('MFA_CHALLENGE_FAILED')).resolves.toBeGreaterThanOrEqual(
      beforeFailures + 5,
    );
  });
});
