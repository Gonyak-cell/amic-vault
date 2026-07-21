import { Injectable } from '@nestjs/common';
import { roleAllowsDocumentAction } from '../../permission/confidentiality-policy';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';

@Injectable()
export class DocumentScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    if (!roleAllowsDocumentAction(actor.role, 'read')) {
      return { sql: 'FALSE', params: [], appliedRules: ['document.read:role_deny'] };
    }

    const materialized = actor.materializedScope;
    if (!materialized) {
      return { sql: 'FALSE', params: [], appliedRules: ['document.read:not_materialized'] };
    }

    const params: SearchSqlValue[] = [
      actor.role,
      materialized.allowedDocumentIds,
      materialized.deniedDocumentIds,
    ];

    return {
      sql: `
        EXISTS (
          SELECT 1
          FROM documents d
          WHERE d.tenant_id = idx.tenant_id
            AND d.document_id = idx.document_id
            AND d.status <> 'deleted'
            AND d.deleted_at IS NULL
            AND (
              (
                ? <> 'limited_reviewer'
                AND d.confidentiality_level = 'standard'
                AND d.privilege_status = 'none'
              )
              OR idx.document_id = ANY(?::uuid[])
            )
        )
        AND NOT (idx.document_id = ANY(?::uuid[]))
      `,
      params,
      appliedRules: [
        'document.read:role_allow',
        'document.status:not_deleted',
        'document.permissions:condition_fail_closed',
        'document.permissions:explicit_deny',
        'document.confidentiality:explicit_allow_when_required',
        'document.limited_reviewer:explicit_allow_required',
      ],
    };
  }
}
