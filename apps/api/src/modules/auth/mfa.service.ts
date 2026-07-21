import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type {
  MfaActivateRequestDto,
  MfaEnrollResponseDto,
  MfaVerifyRequestDto,
  TenantId,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { hashPassword, verifyPasswordHash } from '../user/password';
import { createOpaqueToken, hashOpaqueToken, type SessionRecord } from './session.repository';
import { TotpService } from './totp.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

const mfaChallengeTtlMs = 1000 * 60 * 5;
const issuer = 'AMIC Vault';
const secretCipherPrefix = 'v1';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

async function withTenantClient<T>(
  tenantId: TenantId,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface MfaSecretRow {
  secret_id: string;
  secret_ciphertext: string;
  recovery_codes_json: unknown;
}

interface MfaChallengeRow {
  tenant_id: string;
  user_id: string;
  attempt_count: number;
  expires_at: Date;
  verified_at: Date | null;
  locked_at: Date | null;
}

interface RecoveryCodeRecord {
  hash: string;
  usedAt: string | null;
}

export interface VerifiedMfaChallenge {
  tenantId: TenantId;
  userId: string;
}

type MfaVerifyOutcome =
  | { kind: 'verified'; tenantId: TenantId; userId: string }
  | { kind: 'denied'; reason: string };

type MfaActivateOutcome = { kind: 'accepted' } | { kind: 'denied'; reason: string };

export interface MfaChallengeStart {
  mfaRequired: true;
  mfaEnabled: true;
  mfaChallengeId: string;
}

function authRequired(reason: string): UnauthorizedException {
  return new UnauthorizedException({ code: 'AUTH_REQUIRED', reason });
}

function validationFailed(): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED' });
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TotpService) private readonly totp: TotpService,
  ) {}

  async hasActiveSecret(tenantId: TenantId, userId: string): Promise<boolean> {
    return withTenantClient(tenantId, async (client) => {
      const result = await client.query<{ present: boolean }>(
        `
          SELECT true AS present
          FROM mfa_secrets
          WHERE tenant_id = $1
            AND user_id = $2
            AND status = 'active'
          LIMIT 1
        `,
        [tenantId, userId],
      );
      return result.rows.length > 0;
    });
  }

  async startChallenge(tenantId: TenantId, userId: string): Promise<MfaChallengeStart> {
    const token = createOpaqueToken();
    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `
          INSERT INTO mfa_challenges (
            tenant_id, user_id, challenge_token_hash, expires_at
          )
          VALUES ($1, $2, $3, $4)
        `,
        [tenantId, userId, hashOpaqueToken(token), new Date(Date.now() + mfaChallengeTtlMs)],
      );
    });
    return {
      mfaRequired: true,
      mfaEnabled: true,
      mfaChallengeId: `${tenantId}.${token}`,
    };
  }

  async verifyChallenge(input: MfaVerifyRequestDto): Promise<VerifiedMfaChallenge> {
    const parsed = parseChallengeId(input.challengeId);
    if (!parsed) throw authRequired('mfa_invalid');
    const outcome = await withTenantClient(
      parsed.tenantId,
      async (client): Promise<MfaVerifyOutcome> => {
        const challenge = await this.findOpenChallenge(client, parsed.tenantId, parsed.tokenHash);
        if (!challenge) return { kind: 'denied', reason: 'mfa_invalid' };
        if (challenge.expires_at.getTime() <= Date.now() || challenge.locked_at) {
          await this.lockChallenge(client, parsed.tenantId, parsed.tokenHash);
          await this.recordChallengeFailure(challenge, 'mfa_challenge_expired', client);
          return { kind: 'denied', reason: 'mfa_invalid' };
        }

        const secretRow = await this.findActiveSecret(client, parsed.tenantId, challenge.user_id);
        if (!secretRow) {
          await this.incrementChallengeFailure(
            client,
            parsed.tenantId,
            parsed.tokenHash,
            challenge,
          );
          await this.recordChallengeFailure(challenge, 'mfa_secret_missing', client);
          return { kind: 'denied', reason: 'mfa_enrollment_required' };
        }

        const secret = decryptSecret(secretRow.secret_ciphertext);
        const recoveryCodes = parseRecoveryCodes(secretRow.recovery_codes_json);
        const code = input.code.trim();
        const recoveryIndex = this.totp.verify(secret, code)
          ? -2
          : await findRecoveryCodeIndex(recoveryCodes, code);
        if (recoveryIndex === -1) {
          await this.incrementChallengeFailure(
            client,
            parsed.tenantId,
            parsed.tokenHash,
            challenge,
          );
          await this.recordChallengeFailure(challenge, 'mfa_code_invalid', client);
          return { kind: 'denied', reason: 'mfa_invalid' };
        }

        if (recoveryIndex >= 0) {
          const recoveryCode = recoveryCodes[recoveryIndex];
          if (!recoveryCode) return { kind: 'denied', reason: 'mfa_invalid' };
          recoveryCodes[recoveryIndex] = {
            hash: recoveryCode.hash,
            usedAt: new Date().toISOString(),
          };
          await client.query(
            `
            UPDATE mfa_secrets
            SET recovery_codes_json = $3::jsonb
            WHERE tenant_id = $1
              AND secret_id = $2
          `,
            [parsed.tenantId, secretRow.secret_id, JSON.stringify(recoveryCodes)],
          );
        }

        await client.query(
          `
          UPDATE mfa_challenges
          SET verified_at = now()
          WHERE tenant_id = $1
            AND challenge_token_hash = $2
            AND verified_at IS NULL
            AND locked_at IS NULL
        `,
          [parsed.tenantId, parsed.tokenHash],
        );
        await this.auditService.log(
          {
            tenantId: parsed.tenantId,
            actorId: challenge.user_id,
            action: 'MFA_CHALLENGE_SUCCEEDED',
            targetType: 'user',
            targetId: challenge.user_id,
            metadata: { reason_code: recoveryIndex >= 0 ? 'recovery_code' : 'totp' },
          },
          client,
        );
        return { kind: 'verified', tenantId: parsed.tenantId, userId: challenge.user_id };
      },
    );
    if (outcome.kind === 'denied') throw authRequired(outcome.reason);
    return { tenantId: outcome.tenantId, userId: outcome.userId };
  }

  async enroll(session: SessionRecord, accountName: string): Promise<MfaEnrollResponseDto> {
    const secret = this.totp.generateSecret();
    const recoveryCodes = generateRecoveryCodes();
    const recoveryCodeHashes = await Promise.all(
      recoveryCodes.map(async (code) => ({ hash: await hashPassword(code), usedAt: null })),
    );
    const encrypted = encryptSecret(secret);
    const secretId = await withTenantClient(session.tenantId, async (client) => {
      await client.query(
        `
          UPDATE mfa_secrets
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND user_id = $2
            AND status = 'pending'
        `,
        [session.tenantId, session.userId],
      );
      const result = await client.query<{ secret_id: string }>(
        `
          INSERT INTO mfa_secrets (
            tenant_id, user_id, secret_ciphertext, recovery_codes_json, status
          )
          VALUES ($1, $2, $3, $4::jsonb, 'pending')
          RETURNING secret_id
        `,
        [session.tenantId, session.userId, encrypted, JSON.stringify(recoveryCodeHashes)],
      );
      const row = result.rows[0];
      if (!row) throw validationFailed();
      return row.secret_id;
    });
    return {
      secretId,
      otpauthUri: this.totp.otpauthUri({ issuer, accountName, secret }),
      manualEntryKey: secret,
      recoveryCodes,
    };
  }

  async activate(
    session: SessionRecord,
    input: MfaActivateRequestDto,
  ): Promise<{ accepted: true }> {
    const outcome = await withTenantClient(
      session.tenantId,
      async (client): Promise<MfaActivateOutcome> => {
        const secretRow = await this.findPendingSecret(
          client,
          session.tenantId,
          session.userId,
          input.secretId,
        );
        if (!secretRow) throw validationFailed();
        const secret = decryptSecret(secretRow.secret_ciphertext);
        if (!this.totp.verify(secret, input.code)) {
          await this.auditService.log(
            {
              tenantId: session.tenantId,
              actorId: session.userId,
              sessionId: session.sessionId,
              action: 'MFA_CHALLENGE_FAILED',
              targetType: 'user',
              targetId: session.userId,
              result: 'denied',
              metadata: { reason_code: 'mfa_activation_invalid' },
            },
            client,
          );
          return { kind: 'denied', reason: 'mfa_invalid' };
        }
        await client.query(
          `
          UPDATE mfa_secrets
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND user_id = $2
            AND status = 'active'
        `,
          [session.tenantId, session.userId],
        );
        await client.query(
          `
          UPDATE mfa_secrets
          SET status = 'active',
              activated_at = now()
          WHERE tenant_id = $1
            AND secret_id = $2
            AND user_id = $3
            AND status = 'pending'
        `,
          [session.tenantId, input.secretId, session.userId],
        );
        await client.query(
          `
          UPDATE users
          SET mfa_enabled = true,
              updated_at = now()
          WHERE tenant_id = $1
            AND user_id = $2
        `,
          [session.tenantId, session.userId],
        );
        await this.auditService.log(
          {
            tenantId: session.tenantId,
            actorId: session.userId,
            sessionId: session.sessionId,
            action: 'MFA_ENROLLED',
            targetType: 'user',
            targetId: session.userId,
            metadata: { reason_code: 'totp' },
          },
          client,
        );
        return { kind: 'accepted' };
      },
    );
    if (outcome.kind === 'denied') throw authRequired(outcome.reason);
    return { accepted: true };
  }

  private async findOpenChallenge(
    client: QueryClient,
    tenantId: TenantId,
    tokenHash: string,
  ): Promise<MfaChallengeRow | null> {
    const result = await client.query(
      `
        SELECT tenant_id, user_id, attempt_count, expires_at, verified_at, locked_at
        FROM mfa_challenges
        WHERE tenant_id = $1
          AND challenge_token_hash = $2
          AND verified_at IS NULL
        FOR UPDATE
      `,
      [tenantId, tokenHash],
    );
    return (result.rows[0] as MfaChallengeRow | undefined) ?? null;
  }

  private async findActiveSecret(
    client: QueryClient,
    tenantId: TenantId,
    userId: string,
  ): Promise<MfaSecretRow | null> {
    const result = await client.query(
      `
        SELECT secret_id, secret_ciphertext, recovery_codes_json
        FROM mfa_secrets
        WHERE tenant_id = $1
          AND user_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, userId],
    );
    return (result.rows[0] as MfaSecretRow | undefined) ?? null;
  }

  private async findPendingSecret(
    client: QueryClient,
    tenantId: TenantId,
    userId: string,
    secretId: string,
  ): Promise<MfaSecretRow | null> {
    const result = await client.query(
      `
        SELECT secret_id, secret_ciphertext, recovery_codes_json
        FROM mfa_secrets
        WHERE tenant_id = $1
          AND user_id = $2
          AND secret_id = $3
          AND status = 'pending'
        LIMIT 1
      `,
      [tenantId, userId, secretId],
    );
    return (result.rows[0] as MfaSecretRow | undefined) ?? null;
  }

  private async incrementChallengeFailure(
    client: QueryClient,
    tenantId: TenantId,
    tokenHash: string,
    challenge: MfaChallengeRow,
  ): Promise<void> {
    const nextAttemptCount = challenge.attempt_count + 1;
    await client.query(
      `
        UPDATE mfa_challenges
        SET attempt_count = $3,
            locked_at = CASE WHEN $3 >= 5 THEN now() ELSE locked_at END
        WHERE tenant_id = $1
          AND challenge_token_hash = $2
      `,
      [tenantId, tokenHash, nextAttemptCount],
    );
  }

  private async lockChallenge(client: QueryClient, tenantId: TenantId, tokenHash: string) {
    await client.query(
      `
        UPDATE mfa_challenges
        SET locked_at = COALESCE(locked_at, now())
        WHERE tenant_id = $1
          AND challenge_token_hash = $2
      `,
      [tenantId, tokenHash],
    );
  }

  private async recordChallengeFailure(
    challenge: MfaChallengeRow,
    reasonCode: string,
    client: QueryClient,
  ): Promise<void> {
    await this.auditService.log(
      {
        tenantId: challenge.tenant_id,
        actorId: challenge.user_id,
        action: 'MFA_CHALLENGE_FAILED',
        targetType: 'user',
        targetId: challenge.user_id,
        result: 'denied',
        metadata: { reason_code: reasonCode },
      },
      client,
    );
  }
}

function parseChallengeId(input: string): { tenantId: TenantId; tokenHash: string } | null {
  const [tenantId, token] = input.split('.');
  if (!tenantId || !token) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
  ) {
    return null;
  }
  return { tenantId: tenantId as TenantId, tokenHash: hashOpaqueToken(token) };
}

function parseRecoveryCodes(input: unknown): RecoveryCodeRecord[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isRecoveryCodeRecord);
}

function isRecoveryCodeRecord(input: unknown): input is RecoveryCodeRecord {
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as RecoveryCodeRecord).hash === 'string' &&
    ((input as RecoveryCodeRecord).usedAt === null ||
      typeof (input as RecoveryCodeRecord).usedAt === 'string')
  );
}

async function findRecoveryCodeIndex(
  recoveryCodes: RecoveryCodeRecord[],
  code: string,
): Promise<number> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return -1;
  for (let index = 0; index < recoveryCodes.length; index += 1) {
    const record = recoveryCodes[index];
    if (!record || record.usedAt) continue;
    if (await verifyPasswordHash(record.hash, normalized)) return index;
  }
  return -1;
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const value = randomBytes(8)
      .toString('base64url')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 10)}`;
  });
}

function normalizeRecoveryCode(input: string): string | null {
  const normalized = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return normalized.length >= 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : null;
}

function encryptionKey(): Buffer {
  const raw = process.env.MFA_SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error('MFA_SECRET_ENCRYPTION_KEY is required');
  return createHash('sha256').update(raw).digest();
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [secretCipherPrefix, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join(':');
}

function decryptSecret(payload: string): string {
  const [version, ivText, tagText, ciphertextText] = payload.split(':');
  if (version !== secretCipherPrefix || !ivText || !tagText || !ciphertextText) {
    throw new Error('invalid_mfa_secret_payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
