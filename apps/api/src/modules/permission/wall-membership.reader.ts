import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { TenantId } from '@amic-vault/shared';
import { tenantQuery } from '../../common/db/tenant-query';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://amic_vault:amic_vault_dev_password@localhost:5432/amic_vault';

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl });
  return pool;
}

export interface MatterWallMembershipState {
  hasActiveWall: boolean;
  isExcluded: boolean;
  isInsider: boolean;
  wallIds: string[];
  excludedWallIds: string[];
  insiderWallIds: string[];
}

interface WallMembershipRow {
  wall_id: string;
  membership_type: 'insider' | 'excluded';
}

@Injectable()
export class WallMembershipReader {
  async readUserMatterState(
    tenantId: TenantId,
    matterId: string,
    userId: string,
  ): Promise<MatterWallMembershipState> {
    const result = await tenantQuery<WallMembershipRow>(
      getPool(),
      tenantId,
      `
        SELECT ew.wall_id, ewm.membership_type
        FROM ethical_walls ew
        JOIN ethical_wall_memberships ewm
          ON ewm.tenant_id = ew.tenant_id
         AND ewm.wall_id = ew.wall_id
        WHERE ew.tenant_id = $1
          AND ew.matter_id = $2
          AND ew.status = 'active'
          AND ewm.subject_type = 'user'
          AND ewm.subject_id = $3::uuid
      `,
      [tenantId, matterId, userId],
    );
    const wallIds = result.rows.map((row) => row.wall_id);
    const excludedWallIds = result.rows
      .filter((row) => row.membership_type === 'excluded')
      .map((row) => row.wall_id);
    const insiderWallIds = result.rows
      .filter((row) => row.membership_type === 'insider')
      .map((row) => row.wall_id);
    return {
      hasActiveWall: await this.hasActiveMatterWall(tenantId, matterId),
      isExcluded: excludedWallIds.length > 0,
      isInsider: insiderWallIds.length > 0,
      wallIds,
      excludedWallIds,
      insiderWallIds,
    };
  }

  private async hasActiveMatterWall(tenantId: TenantId, matterId: string): Promise<boolean> {
    const result = await tenantQuery(
      getPool(),
      tenantId,
      `
        SELECT 1
        FROM ethical_walls
        WHERE tenant_id = $1
          AND matter_id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [tenantId, matterId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
