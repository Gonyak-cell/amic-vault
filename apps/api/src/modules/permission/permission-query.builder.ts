import { Injectable } from '@nestjs/common';
import type { UserRole } from '@amic-vault/shared';
import { rolePermissionDecision } from '@amic-vault/shared';

export interface PermissionQueryContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface PermissionSqlFilter {
  sql: string;
  params: unknown[];
  appliedRules: string[];
}

@Injectable()
export class PermissionQueryBuilder {
  buildMatterFilter(
    ctx: PermissionQueryContext,
    firstParamIndex: number,
    matterAlias = 'matters',
  ): PermissionSqlFilter {
    if (rolePermissionDecision(ctx.role, 'matter.read') === 'deny') {
      return { sql: 'FALSE', params: [], appliedRules: ['matter.read:role_deny'] };
    }

    const memberParam = firstParamIndex;
    const wallParam = firstParamIndex + 1;
    return {
      sql: `
        EXISTS (
          SELECT 1
          FROM matter_members mm
          WHERE mm.tenant_id = ${matterAlias}.tenant_id
            AND mm.matter_id = ${matterAlias}.matter_id
            AND mm.user_id = $${memberParam}::uuid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ethical_walls ew
          JOIN ethical_wall_memberships ewm
            ON ewm.tenant_id = ew.tenant_id
           AND ewm.wall_id = ew.wall_id
          WHERE ew.tenant_id = ${matterAlias}.tenant_id
            AND ew.matter_id = ${matterAlias}.matter_id
            AND ew.status = 'active'
            AND (
              (ewm.subject_type = 'user' AND ewm.subject_id = $${wallParam}::uuid)
              OR (
                ewm.subject_type = 'group'
                AND ewm.subject_id IN (
                  SELECT gm.group_id
                  FROM group_members gm
                  WHERE gm.tenant_id = ${matterAlias}.tenant_id
                    AND gm.user_id = $${wallParam}::uuid
                )
              )
            )
            AND ewm.membership_type = 'excluded'
        )
      `,
      params: [ctx.userId, ctx.userId],
      appliedRules: ['matter.membership:required', 'ethical_wall:excluded_filter'],
    };
  }
}
