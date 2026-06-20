import { Injectable } from '@nestjs/common';
import {
  searchFiltersSchema,
  type SearchConfidentialityLevel,
  type SearchFiltersDto,
  type SearchLegalHold,
  type SearchPrivilegeStatus,
  type SearchRecordsStatus,
  type SearchVersionStatus,
} from '@amic-vault/shared';

export type SearchSqlValue = string | number | boolean | Date | readonly string[];

export interface SearchSqlFragment {
  sql: string;
  params: readonly SearchSqlValue[];
}

export interface BuiltSearchFilter {
  whereSql: string;
  params: SearchSqlValue[];
}

export interface BuildSearchFilterInput {
  filters?: SearchFiltersDto | undefined;
  scope?: SearchSqlFragment | undefined;
}

export const denyAllSearchScope: SearchSqlFragment = {
  sql: 'FALSE',
  params: [],
};

export const searchExtractionStatusSql = `
  coalesce((
    SELECT cd.extraction_status
    FROM canonical_documents cd
    WHERE cd.tenant_id = idx.tenant_id
      AND cd.version_id = idx.version_id
    LIMIT 1
  ), 'pending')
`;

export const searchDocumentLegalHoldSql = `
  EXISTS (
    SELECT 1
    FROM documents document_hold_filter
    WHERE document_hold_filter.tenant_id = idx.tenant_id
      AND document_hold_filter.document_id = idx.document_id
      AND document_hold_filter.legal_hold = true
  )
`;

export const searchMatterLegalHoldSql = `
  EXISTS (
    SELECT 1
    FROM matters matter_hold_filter
    WHERE matter_hold_filter.tenant_id = idx.tenant_id
      AND matter_hold_filter.matter_id = idx.matter_id
      AND matter_hold_filter.legal_hold = true
  )
`;

export const searchConfidentialityLevelSql = `
  (
    SELECT confidentiality_doc.confidentiality_level
    FROM documents confidentiality_doc
    WHERE confidentiality_doc.tenant_id = idx.tenant_id
      AND confidentiality_doc.document_id = idx.document_id
    LIMIT 1
  )
`;

export const searchPrivilegeStatusSql = `
  (
    SELECT privilege_doc.privilege_status
    FROM documents privilege_doc
    WHERE privilege_doc.tenant_id = idx.tenant_id
      AND privilege_doc.document_id = idx.document_id
    LIMIT 1
  )
`;

export const searchLegalHoldSql = `
  CASE
    WHEN ${searchDocumentLegalHoldSql} THEN 'document_hold'
    WHEN ${searchMatterLegalHoldSql} THEN 'matter_hold'
    ELSE 'no_hold'
  END
`;

export const searchRecordsStatusSql = `
  CASE
    WHEN idx.document_status = 'archived' THEN 'archived'
    WHEN idx.document_status = 'disposal_locked' THEN 'disposal_locked'
    ELSE 'active'
  END
`;

interface BindingState {
  params: SearchSqlValue[];
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

@Injectable()
export class SearchFilterBuilder {
  build(input: BuildSearchFilterInput = {}): BuiltSearchFilter {
    const filters = searchFiltersSchema.parse(input.filters ?? {});
    const fragments: SearchSqlFragment[] = [
      input.scope ?? denyAllSearchScope,
      { sql: 'idx.document_status <> ?', params: ['deleted'] },
    ];

    const versionStatus: SearchVersionStatus = filters.versionStatus ?? 'current';
    if (versionStatus !== 'all') {
      fragments.push({ sql: 'idx.version_status = ?', params: [versionStatus] });
    }

    if (filters.matterId) {
      fragments.push({ sql: 'idx.matter_id = ?', params: [filters.matterId] });
    }
    if (filters.clientId) {
      fragments.push({ sql: 'idx.client_id = ?', params: [filters.clientId] });
    }
    if (filters.title) {
      fragments.push({ sql: "idx.title ILIKE ? ESCAPE '\\'", params: [likeContains(filters.title)] });
    }
    if (filters.matterCode) {
      fragments.push({
        sql: `
          EXISTS (
            SELECT 1
            FROM matters matter_filter
            WHERE matter_filter.tenant_id = idx.tenant_id
              AND matter_filter.matter_id = idx.matter_id
              AND matter_filter.matter_code ILIKE ? ESCAPE '\\'
          )
        `,
        params: [likeContains(filters.matterCode)],
      });
    }
    if (filters.matterName) {
      fragments.push({
        sql: `
          EXISTS (
            SELECT 1
            FROM matters matter_filter
            WHERE matter_filter.tenant_id = idx.tenant_id
              AND matter_filter.matter_id = idx.matter_id
              AND matter_filter.matter_name ILIKE ? ESCAPE '\\'
          )
        `,
        params: [likeContains(filters.matterName)],
      });
    }
    if (filters.clientName) {
      fragments.push({
        sql: `
          EXISTS (
            SELECT 1
            FROM clients client_filter
            WHERE client_filter.tenant_id = idx.tenant_id
              AND client_filter.client_id = idx.client_id
              AND client_filter.name ILIKE ? ESCAPE '\\'
          )
        `,
        params: [likeContains(filters.clientName)],
      });
    }
    if (filters.documentType) {
      const types = Array.isArray(filters.documentType)
        ? filters.documentType
        : [filters.documentType];
      fragments.push({ sql: 'idx.document_type = ANY(?::text[])', params: [types] });
    }
    if (filters.confidentialityLevel) {
      fragments.push(this.confidentialityFilter(filters.confidentialityLevel));
    }
    if (filters.extractionStatus) {
      fragments.push({ sql: `${searchExtractionStatusSql} = ?`, params: [filters.extractionStatus] });
    }
    if (filters.legalHold) {
      fragments.push(this.legalHoldFilter(filters.legalHold));
    }
    if (filters.recordsStatus) {
      fragments.push(this.recordsStatusFilter(filters.recordsStatus));
    }
    if (filters.privilegeStatus) {
      fragments.push(this.privilegeFilter(filters.privilegeStatus));
    }
    if (filters.dateFrom) {
      // document_search_index.updated_at is populated from documents.updated_at by the indexer.
      fragments.push({ sql: 'idx.updated_at >= ?', params: [new Date(filters.dateFrom)] });
    }
    if (filters.dateTo) {
      fragments.push({ sql: 'idx.updated_at <= ?', params: [new Date(filters.dateTo)] });
    }

    const state: BindingState = { params: [] };
    const clauses = fragments.map((fragment) => this.bindFragment(fragment, state));
    return {
      whereSql: `WHERE ${clauses.join('\n  AND ')}`,
      params: state.params,
    };
  }

  private legalHoldFilter(value: SearchLegalHold): SearchSqlFragment {
    if (value === 'document_hold') return { sql: searchDocumentLegalHoldSql, params: [] };
    if (value === 'matter_hold') return { sql: searchMatterLegalHoldSql, params: [] };
    return {
      sql: `NOT (${searchDocumentLegalHoldSql}) AND NOT (${searchMatterLegalHoldSql})`,
      params: [],
    };
  }

  private confidentialityFilter(value: SearchConfidentialityLevel): SearchSqlFragment {
    return { sql: `${searchConfidentialityLevelSql} = ?`, params: [value] };
  }

  private privilegeFilter(value: SearchPrivilegeStatus): SearchSqlFragment {
    return { sql: `${searchPrivilegeStatusSql} = ?`, params: [value] };
  }

  private recordsStatusFilter(value: SearchRecordsStatus): SearchSqlFragment {
    if (value === 'active') {
      return { sql: "idx.document_status NOT IN ('archived', 'disposal_locked')", params: [] };
    }
    return { sql: 'idx.document_status = ?', params: [value] };
  }

  private bindFragment(fragment: SearchSqlFragment, state: BindingState): string {
    let nextParam = 0;
    const sql = fragment.sql.replace(/\?/g, () => {
      if (nextParam >= fragment.params.length) {
        throw new Error('Search SQL fragment has fewer params than placeholders');
      }
      state.params.push(fragment.params[nextParam]!);
      nextParam += 1;
      return `$${state.params.length}`;
    });
    if (nextParam !== fragment.params.length) {
      throw new Error('Search SQL fragment has more params than placeholders');
    }
    return `(${sql})`;
  }
}
