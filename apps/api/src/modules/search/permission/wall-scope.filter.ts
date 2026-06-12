import { Injectable } from '@nestjs/common';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';
import { userWallSubjectPredicate } from './subject-scope.sql';

@Injectable()
export class WallScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    const params: SearchSqlValue[] = [actor.userId, actor.userId, actor.userId, actor.userId];

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
              )
            )
        )
      `,
      params,
      appliedRules: ['ethical_wall:excluded_filter', 'ethical_wall:insider_required_filter'],
    };
  }
}
