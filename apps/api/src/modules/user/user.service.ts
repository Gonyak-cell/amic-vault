import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { TenantId, TenantStatus, UserRole, UserStatus } from '@amic-vault/shared';
import type { QueryClient } from '../audit/audit.service';
import type { TenantEntity } from '../tenant/tenant.entity';
import { hashPassword, normalizeEmail } from './password';
import { UserEntity } from './user.entity';

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

interface UserRow {
  user_id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: UserRole;
  practice_group: string | null;
  status: UserStatus;
  password_hash: string;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface LoginCandidateRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_region: string;
  tenant_data_residency: string;
  tenant_status: TenantStatus;
  tenant_created_at: Date;
  tenant_updated_at: Date;
  user_id: string;
  user_email: string;
  user_name: string;
  user_role: UserRole;
  user_practice_group: string | null;
  user_status: UserStatus;
  user_password_hash: string;
  user_mfa_enabled: boolean;
  user_last_login_at: Date | null;
  user_created_at: Date;
  user_updated_at: Date;
}

function mapUser(row: UserRow): UserEntity {
  return new UserEntity({
    userId: row.user_id,
    tenantId: row.tenant_id as TenantId,
    email: row.email,
    name: row.name,
    role: row.role,
    practiceGroup: row.practice_group,
    status: row.status,
    passwordHash: row.password_hash,
    mfaEnabled: row.mfa_enabled,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapLoginCandidate(row: LoginCandidateRow): LoginCandidate {
  const tenant: TenantEntity = {
    tenantId: row.tenant_id as TenantId,
    name: row.tenant_name,
    slug: row.tenant_slug,
    region: row.tenant_region,
    dataResidency: row.tenant_data_residency,
    status: row.tenant_status,
    createdAt: row.tenant_created_at,
    updatedAt: row.tenant_updated_at,
  };
  const user = new UserEntity({
    userId: row.user_id,
    tenantId: row.tenant_id as TenantId,
    email: row.user_email,
    name: row.user_name,
    role: row.user_role,
    practiceGroup: row.user_practice_group,
    status: row.user_status,
    passwordHash: row.user_password_hash,
    mfaEnabled: row.user_mfa_enabled,
    lastLoginAt: row.user_last_login_at,
    createdAt: row.user_created_at,
    updatedAt: row.user_updated_at,
  });
  return { tenant, user };
}

export interface CreateUserInput {
  tenantId: TenantId;
  email: string;
  name: string;
  role: UserRole;
  practiceGroup: string | null;
  password: string;
}

export interface LoginCandidate {
  tenant: TenantEntity;
  user: UserEntity;
}

export interface UserStore {
  createUser(input: CreateUserInput & { passwordHash: string }): Promise<UserEntity>;
  findUniqueLoginCandidateByEmail(email: string): Promise<LoginCandidate | null>;
  findByTenantAndEmail(tenantId: TenantId, email: string): Promise<UserEntity | null>;
  findByTenantAndId(tenantId: TenantId, userId: string): Promise<UserEntity | null>;
  updatePasswordHash(tenantId: TenantId, userId: string, passwordHash: string): Promise<void>;
  setMfaEnabled(tenantId: TenantId, userId: string, enabled: boolean): Promise<void>;
  recordLoginSuccess(tenantId: TenantId, userId: string, client?: QueryClient): Promise<void>;
  updateRole(
    tenantId: TenantId,
    userId: string,
    role: UserRole,
    client?: QueryClient,
  ): Promise<UserEntity | null>;
  countActiveUsersByRole(tenantId: TenantId, role: UserRole): Promise<number>;
}

export class PgUserStore implements UserStore {
  async createUser(input: CreateUserInput & { passwordHash: string }): Promise<UserEntity> {
    return withTenantClient(input.tenantId, async (client) => {
      const result = await client.query<UserRow>(
        `
        INSERT INTO users (
          tenant_id, email, name, role, practice_group, status, password_hash, mfa_enabled
        )
        VALUES ($1, lower($2), $3, $4, $5, 'active', $6, false)
        RETURNING user_id, tenant_id, email, name, role, practice_group, status,
          password_hash, mfa_enabled, last_login_at, created_at, updated_at
      `,
        [
          input.tenantId,
          input.email,
          input.name,
          input.role,
          input.practiceGroup,
          input.passwordHash,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('user insert returned no row');
      }
      return mapUser(row);
    });
  }

  async findUniqueLoginCandidateByEmail(email: string): Promise<LoginCandidate | null> {
    const result = await getPool().query<LoginCandidateRow>(
      `
        SELECT tenant_id, tenant_name, tenant_slug, tenant_region, tenant_data_residency,
          tenant_status, tenant_created_at, tenant_updated_at, user_id, user_email,
          user_name, user_role, user_practice_group, user_status, user_password_hash,
          user_mfa_enabled, user_last_login_at, user_created_at, user_updated_at
        FROM app_find_unique_login_candidate_by_email($1)
      `,
      [email],
    );
    const row = result.rows[0];
    return row ? mapLoginCandidate(row) : null;
  }

  async findByTenantAndEmail(tenantId: TenantId, email: string): Promise<UserEntity | null> {
    return withTenantClient(tenantId, async (client) => {
      const result = await client.query<UserRow>(
        `
        SELECT user_id, tenant_id, email, name, role, practice_group, status,
          password_hash, mfa_enabled, last_login_at, created_at, updated_at
        FROM users
        WHERE tenant_id = $1
          AND lower(email) = lower($2)
      `,
        [tenantId, email],
      );
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    });
  }

  async findByTenantAndId(tenantId: TenantId, userId: string): Promise<UserEntity | null> {
    return withTenantClient(tenantId, async (client) => {
      const result = await client.query<UserRow>(
        `
        SELECT user_id, tenant_id, email, name, role, practice_group, status,
          password_hash, mfa_enabled, last_login_at, created_at, updated_at
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
      `,
        [tenantId, userId],
      );
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    });
  }

  async updatePasswordHash(
    tenantId: TenantId,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `
        UPDATE users
        SET password_hash = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
        [tenantId, userId, passwordHash],
      );
    });
  }

  async setMfaEnabled(tenantId: TenantId, userId: string, enabled: boolean): Promise<void> {
    await withTenantClient(tenantId, async (client) => {
      await client.query(
        `
        UPDATE users
        SET mfa_enabled = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
        [tenantId, userId, enabled],
      );
    });
  }

  async recordLoginSuccess(
    tenantId: TenantId,
    userId: string,
    client: QueryClient = getPool(),
  ): Promise<void> {
    await client.query(
      `
        UPDATE users
        SET last_login_at = now(),
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
      `,
      [tenantId, userId],
    );
  }

  async updateRole(
    tenantId: TenantId,
    userId: string,
    role: UserRole,
    client?: QueryClient,
  ): Promise<UserEntity | null> {
    if (!client) {
      return withTenantClient(tenantId, (tenantClient) =>
        this.updateRole(tenantId, userId, role, tenantClient),
      );
    }
    const result = await client.query(
      `
        UPDATE users
        SET role = $3,
            updated_at = now()
        WHERE tenant_id = $1
          AND user_id = $2
        RETURNING user_id, tenant_id, email, name, role, practice_group, status,
          password_hash, mfa_enabled, last_login_at, created_at, updated_at
      `,
      [tenantId, userId, role],
    );
    const row = result.rows[0] as UserRow | undefined;
    return row ? mapUser(row) : null;
  }

  async countActiveUsersByRole(tenantId: TenantId, role: UserRole): Promise<number> {
    return withTenantClient(tenantId, async (client) => {
      const result = await client.query<{ count: string }>(
        `
        SELECT count(*)::text AS count
        FROM users
        WHERE tenant_id = $1
          AND role = $2
          AND status = 'active'
      `,
        [tenantId, role],
      );
      return Number(result.rows[0]?.count ?? '0');
    });
  }
}

export const USER_STORE = Symbol('USER_STORE');

@Injectable()
export class UserService {
  constructor(@Inject(USER_STORE) private readonly store: UserStore) {}

  async createUser(input: CreateUserInput): Promise<UserEntity> {
    const normalizedEmail = normalizeEmail(input.email);
    const existing = await this.store.findByTenantAndEmail(input.tenantId, normalizedEmail);
    if (existing) {
      throw new ConflictException({ code: 'VALIDATION_FAILED' });
    }
    const passwordHash = await hashPassword(input.password);
    return this.store.createUser({
      ...input,
      email: normalizedEmail,
      passwordHash,
    });
  }

  findUniqueLoginCandidateByEmail(email: string): Promise<LoginCandidate | null> {
    return this.store.findUniqueLoginCandidateByEmail(normalizeEmail(email));
  }

  findByTenantAndEmail(tenantId: TenantId, email: string): Promise<UserEntity | null> {
    return this.store.findByTenantAndEmail(tenantId, normalizeEmail(email));
  }

  findByTenantAndId(tenantId: TenantId, userId: string): Promise<UserEntity | null> {
    return this.store.findByTenantAndId(tenantId, userId);
  }

  async updatePassword(tenantId: TenantId, userId: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.store.updatePasswordHash(tenantId, userId, passwordHash);
  }

  setMfaEnabled(tenantId: TenantId, userId: string, enabled: boolean): Promise<void> {
    return this.store.setMfaEnabled(tenantId, userId, enabled);
  }

  recordLoginSuccess(tenantId: TenantId, userId: string, client?: QueryClient): Promise<void> {
    return this.store.recordLoginSuccess(tenantId, userId, client);
  }

  updateRole(
    tenantId: TenantId,
    userId: string,
    role: UserRole,
    client?: QueryClient,
  ): Promise<UserEntity | null> {
    return this.store.updateRole(tenantId, userId, role, client);
  }

  countActiveUsersByRole(tenantId: TenantId, role: UserRole): Promise<number> {
    return this.store.countActiveUsersByRole(tenantId, role);
  }
}
