import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { QueryClient } from '../audit/audit.service';
import { DatabaseService } from '../../common/db/database.service';

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

export function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const cookieHeader = Array.isArray(header) ? header.join('; ') : header;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const prefix = `${name}=`;
  return cookies.find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

@Injectable()
export class SessionRepository {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async createSession(
    input: {
      tenantId: TenantId;
      userId: string;
      tokenHash: string;
      ipAddress: string | null;
      userAgent: string | null;
      expiresAt: Date;
      mfaVerified?: boolean;
    },
    client?: QueryClient,
  ): Promise<SessionRecord> {
    if (!client) {
      return this.databaseService.tenantTransaction(input.tenantId, (tenantClient) =>
        this.createSession(input, tenantClient),
      );
    }
    const result = await client.query(
      `
        INSERT INTO sessions (
          tenant_id, user_id, token_hash, ip_address, user_agent, expires_at, mfa_verified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING session_id, tenant_id, user_id, token_hash, mfa_verified, expires_at, revoked_at
      `,
      [
        input.tenantId,
        input.userId,
        input.tokenHash,
        input.ipAddress,
        input.userAgent,
        input.expiresAt,
        input.mfaVerified ?? false,
      ],
    );
    const row = result.rows[0] as SessionRow | undefined;
    if (!row) {
      throw new Error('session insert returned no row');
    }
    return mapSession(row);
  }

  async findActiveByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = await this.databaseService.findActiveSessionByTokenHash(tokenHash);
    return row ? mapSession(row) : null;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.databaseService.revokeSessionByTokenHash(tokenHash);
  }

  async revokeAllForUser(tenantId: TenantId, userId: string, client?: QueryClient): Promise<void> {
    if (!client) {
      return this.databaseService.tenantTransaction(tenantId, (tenantClient) =>
        this.revokeAllForUser(tenantId, userId, tenantClient),
      );
    }
    await client.query(
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
