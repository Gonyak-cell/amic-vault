import { Injectable } from '@nestjs/common';
import { rolePermissionDecision } from '@amic-vault/shared';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';
import {
  activePermissionPredicate,
  subjectMatchParams,
  subjectMatchPredicate,
  unsupportedConditionPredicate,
} from './subject-scope.sql';

@Injectable()
export class MatterScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    if (rolePermissionDecision(actor.role, 'matter.read') === 'deny') {
      return { sql: 'FALSE', params: [], appliedRules: ['matter.read:role_deny'] };
    }

    const params: SearchSqlValue[] = [
      actor.tenantId,
      actor.userId,
      ...subjectMatchParams(actor),
      ...subjectMatchParams(actor),
    ];

    return {
      sql: `
        idx.tenant_id = ?
        AND EXISTS (
          SELECT 1
          FROM matter_members mm
          WHERE mm.tenant_id = idx.tenant_id
            AND mm.matter_id = idx.matter_id
            AND mm.user_id = ?::uuid
        )
        AND NOT EXISTS (
          SELECT 1
          FROM permissions p
          WHERE p.tenant_id = idx.tenant_id
            AND p.resource_type = 'matter'
            AND p.resource_id = idx.matter_id
            AND p.action = 'read'
            AND ${activePermissionPredicate('p')}
            AND ${subjectMatchPredicate('p')}
            AND ${unsupportedConditionPredicate('p')}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM permissions p
          WHERE p.tenant_id = idx.tenant_id
            AND p.resource_type = 'matter'
            AND p.resource_id = idx.matter_id
            AND p.action = 'read'
            AND p.effect = 'DENY'
            AND ${activePermissionPredicate('p')}
            AND ${subjectMatchPredicate('p')}
        )
      `,
      params,
      appliedRules: [
        'tenant:match',
        'matter.read:role_allow',
        'matter.membership:required',
        'matter.permissions:condition_fail_closed',
        'matter.permissions:explicit_deny',
      ],
    };
  }
}
