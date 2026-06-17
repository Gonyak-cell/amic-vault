import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type {
  PasswordResetAcceptedDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  TenantId,
  UserStatus,
} from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import type { TenantEntity } from '../tenant/tenant.entity';
import { TenantService } from '../tenant/tenant.service';
import { hashPassword, normalizeEmail } from '../user/password';
import { UserService } from '../user/user.service';
import { MailerStub } from './mailer.stub';
import { createOpaqueToken, hashOpaqueToken, SessionRepository } from './session.repository';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

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

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;

export interface ConsumedPasswordResetToken {
  tenantId: TenantId;
  userId: string;
}

export interface CompletedPasswordReset {
  statusBefore: UserStatus;
  statusAfter: UserStatus;
}

export interface PasswordResetStore {
  revokeOpenTokensForUser(tenantId: TenantId, userId: string): Promise<void>;
  createToken(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeTokenHash(tokenHash: string): Promise<ConsumedPasswordResetToken | null>;
  updateUserPasswordHashAndActivate(
    tenantId: TenantId,
    userId: string,
    passwordHash: string,
    client?: QueryClient,
  ): Promise<CompletedPasswordReset | null>;
}

export class PgPasswordResetStore implements PasswordResetStore {
  async revokeOpenTokensForUser(tenantId: TenantId, userId: string): Promise<void> {
    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `
        UPDATE password_reset_tokens
        SET used_at = COALESCE(used_at, now())
        WHERE tenant_id = $1
          AND user_id = $2
          AND used_at IS NULL
      `,
        [tenantId, userId],
      );
    });
  }

  async createToken(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await withTenantClient(input.tenantId, async (client) => {
      await client.query(
        `
        INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
        [input.tenantId, input.userId, input.tokenHash, input.expiresAt],
      );
    });
  }

  async consumeTokenHash(tokenHash: string): Promise<ConsumedPasswordResetToken | null> {
    const result = await getPool().query<{ tenant_id: string; user_id: string }>(
      `
        SELECT tenant_id, user_id
        FROM app_consume_password_reset_token_hash($1)
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? { tenantId: row.tenant_id as TenantId, userId: row.user_id } : null;
  }

  async updateUserPasswordHashAndActivate(
    tenantId: TenantId,
    userId: string,
    passwordHash: string,
    client?: QueryClient,
  ): Promise<CompletedPasswordReset | null> {
    if (!client) {
      return withTenantClient(tenantId, (tenantClient) =>
        this.updateUserPasswordHashAndActivate(tenantId, userId, passwordHash, tenantClient),
      );
    }
    const result = await client.query(
      `
        WITH target AS (
          SELECT status
          FROM users
          WHERE tenant_id = $1
            AND user_id = $2
          FOR UPDATE
        ),
        updated AS (
          UPDATE users
          SET password_hash = $3,
              status = 'active',
              updated_at = now()
          WHERE tenant_id = $1
            AND user_id = $2
            AND (SELECT status FROM target) IN ('active', 'inactive')
          RETURNING status
        )
        SELECT target.status AS status_before,
               updated.status AS status_after
        FROM target
        LEFT JOIN updated ON true
      `,
      [tenantId, userId, passwordHash],
    );
    const row = result.rows[0] as
      | { status_before: UserStatus; status_after: UserStatus | null }
      | undefined;
    if (!row || !row.status_after) return null;
    return {
      statusBefore: row.status_before,
      statusAfter: row.status_after,
    };
  }
}

export const PASSWORD_RESET_STORE = Symbol('PASSWORD_RESET_STORE');

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(MailerStub) private readonly mailer: MailerStub,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PASSWORD_RESET_STORE) private readonly store: PasswordResetStore,
  ) {}

  async requestReset(input: PasswordResetRequestDto): Promise<PasswordResetAcceptedDto> {
    const tenant = await this.resolveTenant(input);
    const email = normalizeEmail(input.email);
    const user =
      tenant?.status === 'active'
        ? await this.userService.findByTenantAndEmail(tenant.tenantId, email)
        : null;

    if (tenant?.status === 'active' && user && ['active', 'inactive'].includes(user.status)) {
      const token = createOpaqueToken();
      const tokenHash = hashOpaqueToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
      await this.store.revokeOpenTokensForUser(tenant.tenantId, user.userId);
      await this.store.createToken({
        tenantId: tenant.tenantId,
        userId: user.userId,
        tokenHash,
        expiresAt,
      });
      await this.mailer.sendPasswordReset({
        tenantId: tenant.tenantId,
        userId: user.userId,
        email,
        token,
        expiresAt,
      });
    }

    return { accepted: true };
  }

  async confirmReset(input: PasswordResetConfirmDto): Promise<PasswordResetAcceptedDto> {
    const consumed = await this.store.consumeTokenHash(hashOpaqueToken(input.token));
    if (!consumed) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    }

    const passwordHash = await hashPassword(input.password);
    const completed = await this.auditService.transaction(consumed.tenantId, async (client) => {
      const reset = await this.store.updateUserPasswordHashAndActivate(
        consumed.tenantId,
        consumed.userId,
        passwordHash,
        client,
      );
      if (!reset) return null;
      await this.sessions.revokeAllForUser(consumed.tenantId, consumed.userId, client);
      if (reset.statusBefore === 'inactive' && reset.statusAfter === 'active') {
        await this.auditService.log(
          {
            tenantId: consumed.tenantId,
            actorType: 'system',
            action: 'PERMISSION_CHANGED',
            targetType: 'user',
            targetId: consumed.userId,
            metadata: {
              reason_code: 'password_reset_activation',
              status_before: reset.statusBefore,
              status_after: reset.statusAfter,
            },
          },
          client,
        );
      }
      return reset;
    });

    if (!completed) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    }
    return { accepted: true };
  }

  private async resolveTenant(input: PasswordResetRequestDto): Promise<TenantEntity | null> {
    if (input.tenantId) {
      return this.tenantService.findById(input.tenantId);
    }
    if (input.tenantSlug) {
      return this.tenantService.findBySlug(input.tenantSlug);
    }
    return null;
  }
}
