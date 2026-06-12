import { Inject, Injectable } from '@nestjs/common';
import type { SearchQueryDto } from '@amic-vault/shared';
import {
  SearchFilterBuilder,
  type SearchSqlFragment,
  type SearchSqlValue,
} from './search-filter.builder';
import { SnippetBuilder } from './snippet-builder';

export interface BuiltSearchQuery {
  sql: string;
  params: SearchSqlValue[];
}

@Injectable()
export class SearchQueryBuilder {
  constructor(
    @Inject(SearchFilterBuilder)
    private readonly filterBuilder: SearchFilterBuilder,
    @Inject(SnippetBuilder)
    private readonly snippetBuilder: SnippetBuilder,
  ) {}

  build(input: SearchQueryDto, scope: SearchSqlFragment): BuiltSearchQuery {
    const filters = this.filterBuilder.build({ filters: input.filters, scope });
    const params = [...filters.params];
    const pageSize = input.pageSize;
    const offset = (input.page - 1) * pageSize;

    if (input.query) {
      params.push(input.query);
      const queryParam = `$${params.length}`;
      params.push(pageSize);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;
      const headlineSql = this.snippetBuilder.headlineSql(
        `CASE WHEN idx.content_tsv @@ tsq.query THEN idx.content_text ELSE idx.title END`,
        'tsq.query',
      );

      return {
        sql: `
          WITH tsq AS (
            SELECT websearch_to_tsquery('simple', ${queryParam}) AS query
          )
          SELECT idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
            idx.title, idx.document_type, idx.version_status, idx.updated_at,
            ts_rank_cd(
              setweight(idx.title_tsv, 'A') || setweight(idx.content_tsv, 'B'),
              tsq.query
            )::float8 AS score,
            ${headlineSql} AS raw_snippet,
            count(*) OVER()::int AS total
          FROM document_search_index idx
          CROSS JOIN tsq
          ${filters.whereSql}
            AND (idx.title_tsv @@ tsq.query OR idx.content_tsv @@ tsq.query)
          ORDER BY score DESC, idx.updated_at DESC, idx.version_id
          LIMIT ${limitParam}
          OFFSET ${offsetParam}
        `,
        params,
      };
    }

    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    return {
      sql: `
        SELECT idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
          idx.title, idx.document_type, idx.version_status, idx.updated_at,
          0::float8 AS score,
          left(COALESCE(NULLIF(idx.content_text, ''), idx.title), 200) AS raw_snippet,
          count(*) OVER()::int AS total
        FROM document_search_index idx
        ${filters.whereSql}
        ORDER BY idx.updated_at DESC, idx.version_id
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      params,
    };
  }
}
