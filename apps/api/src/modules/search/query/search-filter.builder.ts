import { Injectable } from '@nestjs/common';
import {
  searchFiltersSchema,
  type SearchFiltersDto,
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

interface BindingState {
  params: SearchSqlValue[];
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
    if (filters.documentType) {
      const types = Array.isArray(filters.documentType)
        ? filters.documentType
        : [filters.documentType];
      fragments.push({ sql: 'idx.document_type = ANY(?::text[])', params: [types] });
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
