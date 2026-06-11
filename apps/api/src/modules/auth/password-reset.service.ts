import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  PasswordResetAcceptedDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  TenantId,
} from '@amic-vault/shared';
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

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;

export interface ConsumedPasswordResetToken {
  tenantId: TenantId;
  userId: string;
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
  updateUserPasswordHash(tenantId: TenantId, userId: string, passwordHash: string): Promise<void>;
}

export class PgPasswordResetStore implements PasswordResetStore {
  async revokeOpenTokensForUser(tenantId: TenantId, userId: string): Promise<void> {
    await getPool().query(
      `
        UPDATE password_reset_tokens
        SET used_at = COALESCE(used_at, now())
        WHERE tenant_id = $1
          AND user_id = $2
          AND used_at IS NULL
      `,
      [tenantId, userId],
    );
  }

  async createToken(input: {
    tenantId: TenantId;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await getPool().query(
      `
        INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [input.tenantId, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  async consumeTokenHash(tokenHash: string): Promise<ConsumedPasswordResetToken | null> {
    const result = await getPool().query<{ tenant_id: string; user_id: string }>(
      `
        UPDATE password_reset_tokens
        SET used_at = now()
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING tenant_id, user_id
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? { tenantId: row.tenant_id as TenantId, userId: row.user_id } : null;
  }

  async updateUserPasswordHash(
    tenantId: TenantId,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await getPool().query(
      `
        UPDATE users
        SET password_hash = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
      [tenantId, userId, passwordHash],
    );
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
    @Inject(PASSWORD_RESET_STORE) private readonly store: PasswordResetStore,
  ) {}

  async requestReset(input: PasswordResetRequestDto): Promise<PasswordResetAcceptedDto> {
    const tenant = await this.resolveTenant(input);
    const email = normalizeEmail(input.email);
    const user =
      tenant?.status === 'active'
        ? await this.userService.findByTenantAndEmail(tenant.tenantId, email)
        : null;

    if (tenant?.status === 'active' && user?.status === 'active') {
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
    await this.store.updateUserPasswordHash(consumed.tenantId, consumed.userId, passwordHash);
    await this.sessions.revokeAllForUser(consumed.tenantId, consumed.userId);
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
