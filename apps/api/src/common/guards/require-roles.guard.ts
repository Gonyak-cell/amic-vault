import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool, type PoolClient } from 'pg';
import { isUserRole, type UserRole } from '@amic-vault/shared';
import type { RequestWithSession } from '../../modules/auth/session.guard';
import { REQUIRED_ROLES_KEY } from '../decorators/require-roles.decorator';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

async function withTenantClient<T>(
  tenantId: string,
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

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

@Injectable()
export class PgRoleLookup {
  async findActiveRole(tenantId: string, userId: string): Promise<UserRole | null> {
    return withTenantClient(tenantId, async (client) => {
      const result = await client.query<{ role: string }>(
        `
        SELECT role
        FROM users
        WHERE tenant_id = $1
          AND user_id = $2
          AND status = 'active'
      `,
        [tenantId, userId],
      );
      const role = result.rows[0]?.role;
      return role && isUserRole(role) ? role : null;
    });
  }
}

@Injectable()
export class RequireRolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PgRoleLookup) private readonly roleLookup: PgRoleLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<readonly UserRole[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    try {
      const request = context.switchToHttp().getRequest<RequestWithSession>();
      const session = request.session;
      if (!session) throw permissionDenied();
      const role = await this.roleLookup.findActiveRole(session.tenantId, session.userId);
      if (!role || !requiredRoles.includes(role)) throw permissionDenied();
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw permissionDenied();
    }
  }
}
