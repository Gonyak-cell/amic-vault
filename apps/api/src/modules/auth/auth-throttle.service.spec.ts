import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseService } from '../../common/db/database.service';
import { AuthThrottleService } from './auth-throttle.service';

const originalNodeEnv = process.env.NODE_ENV;
const originalMfaKey = process.env.MFA_SECRET_ENCRYPTION_KEY;

class MemoryDatabaseService {
  readonly checks: Array<[string, string]> = [];
  readonly failures: Array<[string, string]> = [];
  readonly consumptions: Array<[string, string]> = [];
  readonly clears: Array<[string, string]> = [];
  allowed = true;
  consumed = true;

  async isAuthThrottleAllowed(scope: string, referenceHash: string): Promise<boolean> {
    this.checks.push([scope, referenceHash]);
    return this.allowed;
  }

  async recordAuthThrottleFailure(scope: string, referenceHash: string): Promise<boolean> {
    this.failures.push([scope, referenceHash]);
    return true;
  }

  async consumeAuthThrottle(scope: string, referenceHash: string): Promise<boolean> {
    this.consumptions.push([scope, referenceHash]);
    return this.consumed;
  }

  async clearAuthThrottle(scope: string, referenceHash: string): Promise<void> {
    this.clears.push([scope, referenceHash]);
  }
}

function service(database = new MemoryDatabaseService()): {
  service: AuthThrottleService;
  database: MemoryDatabaseService;
} {
  process.env.NODE_ENV = 'test';
  process.env.MFA_SECRET_ENCRYPTION_KEY = 'synthetic-auth-throttle-test-key';
  return {
    service: new AuthThrottleService(database as unknown as DatabaseService),
    database,
  };
}

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalMfaKey === undefined) delete process.env.MFA_SECRET_ENCRYPTION_KEY;
  else process.env.MFA_SECRET_ENCRYPTION_KEY = originalMfaKey;
});

describe('AuthThrottleService', () => {
  it('uses only fixed HMAC references for known login accounts and peer addresses', async () => {
    const { service: subject, database } = service();
    const email = 'alpha@test.local';
    const address = '203.0.113.12';
    const keys = subject.loginKeys({
      knownAccount: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111101',
      },
      suppliedIdentifier: email,
      networkAddress: address,
    });

    expect(keys.map((key) => key.scope)).toEqual(['login_account', 'login_network']);
    expect(keys.map((key) => key.referenceHash)).toEqual([
      expect.stringMatching(/^hmac-sha256:[0-9a-f]{64}$/),
      expect.stringMatching(/^hmac-sha256:[0-9a-f]{64}$/),
    ]);
    await subject.isAllowed(keys);
    await subject.recordFailure(keys);
    await subject.clear(keys);

    const persistedArguments = JSON.stringify([
      database.checks,
      database.failures,
      database.clears,
    ]);
    expect(persistedArguments).not.toContain(email);
    expect(persistedArguments).not.toContain(address);
    expect(persistedArguments).not.toContain('11111111-1111-4111-8111-111111111101');
  });

  it('counts reset consumption and treats malformed network input as the fixed unknown reference', async () => {
    const { service: subject, database } = service();
    const malformed = subject.resetKeys({
      tenantHint: 'tenant-alpha',
      suppliedIdentifier: 'missing@test.local',
      networkAddress: 'not-an-ip',
    });
    const unknown = subject.resetKeys({
      tenantHint: 'tenant-alpha',
      suppliedIdentifier: 'missing@test.local',
      networkAddress: null,
    });

    expect(malformed[1]?.referenceHash).toBe(unknown[1]?.referenceHash);
    await expect(subject.consume(malformed)).resolves.toBe(true);
    expect(database.consumptions).toHaveLength(2);
    expect(JSON.stringify(database.consumptions)).not.toContain('missing@test.local');
  });

  it('uses the same bounded unknown references for absent and malformed candidate input', () => {
    const { service: subject } = service();
    const absent = subject.loginKeys({ networkAddress: null });
    const malformed = subject.loginKeys({
      suppliedIdentifier: '  ',
      tenantHint: '  ',
      networkAddress: 'not-an-ip',
    });

    expect(malformed).toEqual(absent);
  });

  it('turns an opaque MFA challenge into a separate HMAC reference without persisting the challenge', async () => {
    const { service: subject, database } = service();
    const challengeId = '11111111-1111-4111-8111-111111111111.synthetic-challenge-token';
    const keys = subject.mfaKeys({ challengeId, networkAddress: '2001:db8::1' });

    await subject.recordFailure(keys);
    expect(keys.map((key) => key.scope)).toEqual(['mfa_challenge', 'mfa_network']);
    expect(JSON.stringify(database.failures)).not.toContain(challengeId);
  });

  it('rejects a direct production secret before producing a throttle reference', () => {
    const { service: subject } = service();
    process.env.NODE_ENV = 'production';
    process.env.MFA_SECRET_ENCRYPTION_KEY = 'must-not-be-read-directly';

    expect(() => subject.loginKeys({})).toThrow('MFA_SECRET_ENCRYPTION_KEY_DIRECT_ENV_FORBIDDEN');
  });

  it('keeps the global throttle migration narrow and HMAC-only', () => {
    const migration = readFileSync(
      resolve(process.cwd(), '../../db/migrations/0209_create_auth_throttle_states.sql'),
      'utf8',
    );
    const tableDefinition = migration.match(
      /CREATE TABLE auth_throttle_states \(([\s\S]*?)\n\);/u,
    )?.[1];

    expect(migration).toContain('RLS-EXEMPT: pre-authentication rate state');
    expect(migration).toContain('REVOKE ALL ON TABLE auth_throttle_states FROM vault_app');
    expect(migration).not.toMatch(/GRANT[^\n]*ON TABLE auth_throttle_states[^\n]*vault_app/iu);
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain('AUTH_THROTTLE_INPUT_INVALID');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(tableDefinition).toBeDefined();
    expect(tableDefinition).not.toMatch(
      /\b(email|ip_address|tenant_id|user_id|token|code|user_agent|request_body)\b/iu,
    );
    expect(tableDefinition).toContain("reference_hash text NOT NULL CHECK (reference_hash ~ '^hmac-sha256:[0-9a-f]{64}$')");
  });
});
