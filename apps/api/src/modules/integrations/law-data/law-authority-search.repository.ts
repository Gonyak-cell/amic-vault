import { Injectable } from '@nestjs/common';
import type { QueryClient } from '../../audit/audit.service';

export interface LawAuthoritySearchInput {
  page: number;
  pageSize: number;
  query: string | undefined;
  sortBy?: 'relevance' | 'updated_desc' | 'updated_asc' | 'title_asc' | 'matter_asc' | 'type_asc';
}

export interface LawAuthoritySearchRow {
  authority_id: string;
  citation: string;
  external_ref: string;
  raw_snippet: string | null;
  score: number | string;
  source_type: string;
  source_url: string;
  title: string;
  total: number | string;
  updated_at: Date;
}

function orderBySql(sortBy: LawAuthoritySearchInput['sortBy']): string {
  if (sortBy === 'updated_asc') return 'ea.updated_at ASC, ea.authority_id';
  if (sortBy === 'updated_desc') return 'ea.updated_at DESC, ea.authority_id';
  if (sortBy === 'title_asc') return 'lower(ea.title) ASC, ea.updated_at DESC, ea.authority_id';
  return 'score DESC, ea.updated_at DESC, ea.authority_id';
}

@Injectable()
export class LawAuthoritySearchRepository {
  async search(
    client: QueryClient,
    input: LawAuthoritySearchInput,
  ): Promise<LawAuthoritySearchRow[]> {
    const query = input.query?.trim();
    if (!query) return [];

    const pageSize = input.pageSize;
    const offset = (input.page - 1) * pageSize;
    const result = await client.query(
      `
        WITH tsq AS (
          SELECT
            websearch_to_tsquery('simple', $1) AS query,
            amic_korean_search_normalize($1) AS normalized_query
        )
        SELECT
          ea.authority_id,
          ea.source_type,
          ea.external_ref,
          ea.title,
          ea.citation,
          ea.source_url,
          ea.updated_at,
          GREATEST(
            ts_rank_cd(setweight(ea.search_vector, 'A'), tsq.query)::float8,
            CASE
              WHEN tsq.normalized_query <> ''
                AND amic_korean_search_normalize(ea.search_text) LIKE ('%' || tsq.normalized_query || '%')
              THEN 0.05
              ELSE 0
            END
          ) AS score,
          ts_headline(
            'simple',
            ea.search_text,
            tsq.query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=32, MinWords=8'
          ) AS raw_snippet,
          count(*) OVER()::int AS total
        FROM external_authorities ea
        CROSS JOIN tsq
        WHERE (
          ea.search_vector @@ tsq.query
          OR (
            tsq.normalized_query <> ''
            AND amic_korean_search_normalize(ea.search_text) LIKE ('%' || tsq.normalized_query || '%')
          )
        )
        ORDER BY ${orderBySql(input.sortBy)}
        LIMIT $2
        OFFSET $3
      `,
      [query, pageSize, offset],
    );
    return result.rows as LawAuthoritySearchRow[];
  }
}
