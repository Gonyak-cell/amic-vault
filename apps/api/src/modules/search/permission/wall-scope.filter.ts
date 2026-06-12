import { Injectable } from '@nestjs/common';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';
import { userWallSubjectPredicate } from './subject-scope.sql';

@Injectable()
export class WallScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    const params: SearchSqlValue[] = [
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
    ];

    return {
      sql: `
        NOT EXISTS (
          SELECT 1
          FROM ethical_walls ew
          WHERE ew.tenant_id = idx.tenant_id
            AND ew.matter_id = idx.matter_id
            AND ew.status = 'active'
            AND (
              EXISTS (
                SELECT 1
                FROM ethical_wall_memberships excluded
                WHERE excluded.tenant_id = ew.tenant_id
                  AND excluded.wall_id = ew.wall_id
                  AND excluded.membership_type = 'excluded'
                  AND ${userWallSubjectPredicate('excluded', 'ew')}
              )
              AND NOT EXISTS (
                SELECT 1
                FROM break_glass_requests excluded_override
                WHERE excluded_override.tenant_id = ew.tenant_id
                  AND excluded_override.wall_id = ew.wall_id
                  AND excluded_override.requester_id = ?::uuid
                  AND excluded_override.status = 'approved'
                  AND excluded_override.revoked_at IS NULL
                  AND excluded_override.expires_at > now()
                  AND (
                    SELECT count(*)
                    FROM break_glass_approvals excluded_approval
                    WHERE excluded_approval.tenant_id = excluded_override.tenant_id
                      AND excluded_approval.request_id = excluded_override.request_id
                  ) >= 2
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
                    AND ${userWallSubjectPredicate('insider', 'ew')}
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM break_glass_requests insider_override
                  WHERE insider_override.tenant_id = ew.tenant_id
                    AND insider_override.wall_id = ew.wall_id
                    AND insider_override.requester_id = ?::uuid
                    AND insider_override.status = 'approved'
                    AND insider_override.revoked_at IS NULL
                    AND insider_override.expires_at > now()
                    AND (
                      SELECT count(*)
                      FROM break_glass_approvals insider_approval
                      WHERE insider_approval.tenant_id = insider_override.tenant_id
                        AND insider_approval.request_id = insider_override.request_id
                    ) >= 2
                )
              )
            )
        )
      `,
      params,
      appliedRules: ['ethical_wall:excluded_filter', 'ethical_wall:insider_required_filter'],
    };
  }
}
