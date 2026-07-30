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
    const subjectParam = firstParamIndex + 1;
    const roleParam = firstParamIndex + 2;
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
          FROM permissions p
          WHERE p.tenant_id = ${matterAlias}.tenant_id
            AND p.resource_type = 'matter'
            AND p.resource_id = ${matterAlias}.matter_id
            AND p.action = 'read'
            AND (p.valid_from IS NULL OR p.valid_from <= now())
            AND (p.valid_to IS NULL OR p.valid_to >= now())
            AND (
              (p.subject_type = 'user' AND p.subject_id = $${subjectParam}::text)
              OR (p.subject_type = 'role' AND p.subject_id = $${roleParam})
              OR (
                p.subject_type = 'group'
                AND p.subject_id IN (
                  SELECT gm.group_id::text
                  FROM group_members gm
                  WHERE gm.tenant_id = ${matterAlias}.tenant_id
                    AND gm.user_id = $${subjectParam}::uuid
                )
              )
            )
            AND (
              p.effect = 'DENY'
              OR (p.condition_json IS NOT NULL AND p.condition_json <> '{}'::jsonb)
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ethical_walls ew
          WHERE ew.tenant_id = ${matterAlias}.tenant_id
            AND ew.matter_id = ${matterAlias}.matter_id
            AND ew.status = 'active'
            AND (
              EXISTS (
                SELECT 1
                FROM ethical_wall_memberships excluded
                WHERE excluded.tenant_id = ew.tenant_id
                  AND excluded.wall_id = ew.wall_id
                  AND excluded.membership_type = 'excluded'
                  AND (
                    (
                      excluded.subject_type = 'user'
                      AND excluded.subject_id = $${subjectParam}::uuid
                    )
                    OR (
                      excluded.subject_type = 'group'
                      AND excluded.subject_id IN (
                        SELECT gm.group_id
                        FROM group_members gm
                        WHERE gm.tenant_id = ${matterAlias}.tenant_id
                          AND gm.user_id = $${subjectParam}::uuid
                      )
                    )
                  )
              )
              OR (
                EXISTS (
                  SELECT 1
                  FROM ethical_wall_memberships any_insider
                  WHERE any_insider.tenant_id = ew.tenant_id
                    AND any_insider.wall_id = ew.wall_id
                    AND any_insider.membership_type = 'insider'
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM ethical_wall_memberships insider
                  WHERE insider.tenant_id = ew.tenant_id
                    AND insider.wall_id = ew.wall_id
                    AND insider.membership_type = 'insider'
                    AND (
                      (
                        insider.subject_type = 'user'
                        AND insider.subject_id = $${subjectParam}::uuid
                      )
                      OR (
                        insider.subject_type = 'group'
                        AND insider.subject_id IN (
                          SELECT gm.group_id
                          FROM group_members gm
                          WHERE gm.tenant_id = ${matterAlias}.tenant_id
                            AND gm.user_id = $${subjectParam}::uuid
                        )
                      )
                    )
                )
              )
            )
        )
      `,
      params: [ctx.userId, ctx.userId, ctx.role],
      appliedRules: [
        'matter_members:required_for_read',
        'matter.permissions:condition_fail_closed',
        'matter.permissions:explicit_deny',
        'ethical_wall:excluded_filter',
        'ethical_wall:insider_required_filter',
        'ethical_wall:break_glass_requires_audited_read',
      ],
    };
  }
}
