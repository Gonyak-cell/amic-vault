import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { runtimeSecretValue } from '../../common/config/runtime-secret';
import { DatabaseService } from '../../common/db/database.service';

export const AUTH_THROTTLE_SCOPES = [
  'login_account',
  'login_network',
  'reset_account',
  'reset_network',
  'mfa_challenge',
  'mfa_network',
] as const;

export type AuthThrottleScope = (typeof AUTH_THROTTLE_SCOPES)[number];

export interface AuthThrottleKey {
  scope: AuthThrottleScope;
  referenceHash: string;
}

export interface AuthThrottleAccountInput {
  knownAccount?: { tenantId: string; userId: string };
  suppliedIdentifier?: string | null;
  tenantHint?: string | null;
  networkAddress?: string | null;
}

const referencePrefix = 'amic-vault.auth-throttle.v1\0';
const hmacReferencePattern = /^hmac-sha256:[0-9a-f]{64}$/u;
const maximumReferenceInputLength = 256;

@Injectable()
export class AuthThrottleService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  loginKeys(input: AuthThrottleAccountInput): AuthThrottleKey[] {
    return this.accountAndNetworkKeys('login_account', 'login_network', input);
  }

  resetKeys(input: AuthThrottleAccountInput): AuthThrottleKey[] {
    return this.accountAndNetworkKeys('reset_account', 'reset_network', input);
  }

  mfaKeys(input: { challengeId: string; networkAddress?: string | null }): AuthThrottleKey[] {
    const key = this.hmacKey();
    const opaqueChallenge = createHash('sha256')
      .update(boundedReferencePart(input.challengeId))
      .digest('hex');
    return [
      {
        scope: 'mfa_challenge',
        referenceHash: hmacReference(key, 'mfa_challenge', `challenge:${opaqueChallenge}`),
      },
      {
        scope: 'mfa_network',
        referenceHash: hmacReference(key, 'mfa_network', networkReference(input.networkAddress)),
      },
    ];
  }

  async isAllowed(keys: readonly AuthThrottleKey[]): Promise<boolean> {
    assertKeys(keys);
    const allowed = await Promise.all(
      keys.map((key) => this.databaseService.isAuthThrottleAllowed(key.scope, key.referenceHash)),
    );
    return allowed.every(Boolean);
  }

  async recordFailure(keys: readonly AuthThrottleKey[]): Promise<void> {
    assertKeys(keys);
    const recorded = await Promise.all(
      keys.map((key) => this.databaseService.recordAuthThrottleFailure(key.scope, key.referenceHash)),
    );
    if (!recorded.every(Boolean)) throw new Error('AUTH_THROTTLE_RECORD_DENIED');
  }

  async consume(keys: readonly AuthThrottleKey[]): Promise<boolean> {
    assertKeys(keys);
    const consumed = await Promise.all(
      keys.map((key) => this.databaseService.consumeAuthThrottle(key.scope, key.referenceHash)),
    );
    return consumed.every(Boolean);
  }

  async clear(keys: readonly AuthThrottleKey[]): Promise<void> {
    assertKeys(keys);
    await Promise.all(
      keys.map((key) => this.databaseService.clearAuthThrottle(key.scope, key.referenceHash)),
    );
  }

  private accountAndNetworkKeys(
    accountScope: Extract<AuthThrottleScope, 'login_account' | 'reset_account'>,
    networkScope: Extract<AuthThrottleScope, 'login_network' | 'reset_network'>,
    input: AuthThrottleAccountInput,
  ): AuthThrottleKey[] {
    const key = this.hmacKey();
    return [
      {
        scope: accountScope,
        referenceHash: hmacReference(key, accountScope, accountReference(input)),
      },
      {
        scope: networkScope,
        referenceHash: hmacReference(key, networkScope, networkReference(input.networkAddress)),
      },
    ];
  }

  private hmacKey(): Buffer {
    const secret = runtimeSecretValue('MFA_SECRET_ENCRYPTION_KEY', process.env, {
      maximumBytes: 4096,
    });
    return createHash('sha256').update(referencePrefix).update(secret).digest();
  }
}

function hmacReference(key: Buffer, scope: AuthThrottleScope, value: string): string {
  return `hmac-sha256:${createHmac('sha256', key)
    .update(referencePrefix)
    .update(scope)
    .update('\0')
    .update(value)
    .digest('hex')}`;
}

function accountReference(input: AuthThrottleAccountInput): string {
  if (input.knownAccount) {
    return `account:${boundedReferencePart(input.knownAccount.tenantId)}:${boundedReferencePart(
      input.knownAccount.userId,
    )}`;
  }
  return `candidate:${boundedReferencePart(input.tenantHint)}:${boundedReferencePart(
    input.suppliedIdentifier,
  )}`;
}

function networkReference(input: string | null | undefined): string {
  const normalized = input?.trim().toLowerCase() ?? '';
  return isIP(normalized) !== 0 ? normalized : 'unknown';
}

function boundedReferencePart(input: string | null | undefined): string {
  const normalized = input?.normalize('NFKC').trim().toLowerCase() ?? '';
  return normalized ? normalized.slice(0, maximumReferenceInputLength) : 'unknown';
}

function assertKeys(keys: readonly AuthThrottleKey[]): void {
  if (
    keys.length === 0 ||
    keys.some(
      (key) =>
        !AUTH_THROTTLE_SCOPES.includes(key.scope) || !hmacReferencePattern.test(key.referenceHash),
    )
  ) {
    throw new Error('AUTH_THROTTLE_KEY_INVALID');
  }
}
