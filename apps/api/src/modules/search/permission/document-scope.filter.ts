import { Injectable } from '@nestjs/common';
import { roleAllowsDocumentAction } from '../../permission/confidentiality-policy';
import type { SearchSqlValue } from '../query/search-filter.builder';
import type { SearchPermissionActor, SearchScopeFilter } from './search-scope.types';
import {
  activePermissionPredicate,
  subjectMatchParams,
  subjectMatchPredicate,
  unsupportedConditionPredicate,
} from './subject-scope.sql';

@Injectable()
export class DocumentScopeFilter {
  build(actor: SearchPermissionActor): SearchScopeFilter {
    if (!roleAllowsDocumentAction(actor.role, 'read')) {
      return { sql: 'FALSE', params: [], appliedRules: ['document.read:role_deny'] };
    }

    const allowPredicate = `
      EXISTS (
        SELECT 1
        FROM permissions allow_p
        WHERE allow_p.tenant_id = d.tenant_id
          AND allow_p.resource_type = 'document'
          AND allow_p.resource_id = d.document_id
          AND allow_p.action = 'read'
          AND allow_p.effect = 'ALLOW'
          AND ${activePermissionPredicate('allow_p')}
          AND ${subjectMatchPredicate('allow_p')}
          AND NOT (${unsupportedConditionPredicate('allow_p')})
      )
    `;

    const params: SearchSqlValue[] = [
      ...subjectMatchParams(actor),
      ...subjectMatchParams(actor),
      actor.role,
      ...subjectMatchParams(actor),
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
            AND NOT EXISTS (
              SELECT 1
              FROM permissions p
              WHERE p.tenant_id = d.tenant_id
                AND p.resource_type = 'document'
                AND p.resource_id = d.document_id
                AND p.action = 'read'
                AND ${activePermissionPredicate('p')}
                AND ${subjectMatchPredicate('p')}
                AND ${unsupportedConditionPredicate('p')}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM permissions p
              WHERE p.tenant_id = d.tenant_id
                AND p.resource_type = 'document'
                AND p.resource_id = d.document_id
                AND p.action = 'read'
                AND p.effect = 'DENY'
                AND ${activePermissionPredicate('p')}
                AND ${subjectMatchPredicate('p')}
            )
            AND (
              (
                ? <> 'limited_reviewer'
                AND d.confidentiality_level = 'standard'
                AND d.privilege_status = 'none'
              )
              OR ${allowPredicate}
            )
        )
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
