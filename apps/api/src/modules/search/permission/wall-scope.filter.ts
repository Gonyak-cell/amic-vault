import { Injectable } from '@nestjs/common';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';

@Injectable()
export class WallScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    const materialized = actor.materializedScope;
    if (!materialized) {
      return { sql: 'FALSE', params: [], appliedRules: ['ethical_wall:not_materialized'] };
    }

    const params: SearchSqlValue[] = [materialized.wallBlockedMatterIds];

    return {
      sql: `
        NOT (idx.matter_id = ANY(?::uuid[]))
      `,
      params,
      appliedRules: ['ethical_wall:excluded_filter', 'ethical_wall:insider_required_filter'],
    };
  }
}
