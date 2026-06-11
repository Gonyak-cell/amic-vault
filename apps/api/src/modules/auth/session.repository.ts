import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { TenantId } from '@amic-vault/shared';
import type { QueryClient } from '../audit/audit.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export const SESSION_COOKIE_NAME = 'amic_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export interface SessionRecord {
  sessionId: string;
  tenantId: TenantId;
  userId: string;
  tokenHash: string;
  mfaVerified: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface SessionRow {
  session_id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  mfa_verified: boolean;
  expires_at: Date;
  revoked_at: Date | null;
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    sessionId: row.session_id,
    tenantId: row.tenant_id as TenantId,
    userId: row.user_id,
    tokenHash: row.token_hash,
    mfaVerified: row.mfa_verified,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

export function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const cookieHeader = Array.isArray(header) ? header.join('; ') : header;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const prefix = `${name}=`;
  return cookies.find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

@Injectable()
export class SessionRepository {
  async createSession(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }, client: QueryClient = getPool()): Promise<SessionRecord> {
    const result = await client.query(
      `
        INSERT INTO sessions (
          tenant_id, user_id, token_hash, ip_address, user_agent, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING session_id, tenant_id, user_id, token_hash, mfa_verified, expires_at, revoked_at
      `,
      [
        input.tenantId,
        input.userId,
        input.tokenHash,
        input.ipAddress,
        input.userAgent,
        input.expiresAt,
      ],
    );
    const row = result.rows[0] as SessionRow | undefined;
    if (!row) {
      throw new Error('session insert returned no row');
    }
    return mapSession(row);
  }

  async findActiveByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const result = await getPool().query<SessionRow>(
      `
        SELECT session_id, tenant_id, user_id, token_hash, mfa_verified, expires_at, revoked_at
        FROM sessions
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? mapSession(row) : null;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await getPool().query(
      `
        UPDATE sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE token_hash = $1
      `,
      [tokenHash],
    );
  }

  async revokeAllForUser(tenantId: TenantId, userId: string): Promise<void> {
    await getPool().query(
      `
        UPDATE sessions
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE tenant_id = $1
          AND user_id = $2
          AND revoked_at IS NULL
      `,
      [tenantId, userId],
    );
  }
}
