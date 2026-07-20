import { Injectable } from '@nestjs/common';
import { rolePermissionDecision } from '@amic-vault/shared';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';

@Injectable()
export class MatterScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    if (rolePermissionDecision(actor.role, 'matter.read') === 'deny') {
      return { sql: 'FALSE', params: [], appliedRules: ['matter.read:role_deny'] };
    }

    const materialized = actor.materializedScope;
    if (!materialized) {
      return { sql: 'FALSE', params: [], appliedRules: ['matter.read:not_materialized'] };
    }

    const params: SearchSqlValue[] = [
      actor.tenantId,
      materialized.allowedMatterIds,
      materialized.deniedMatterIds,
    ];

    return {
      sql: `
        idx.tenant_id = ?
        AND idx.matter_id = ANY(?::uuid[])
        AND NOT (idx.matter_id = ANY(?::uuid[]))
      `,
      params,
      appliedRules: [
        'tenant:match',
        'matter.read:role_allow',
        'matter_members:materialized_required_for_read',
        'matter.permissions:condition_fail_closed',
        'matter.permissions:explicit_deny',
      ],
    };
  }
}
