import { Inject, Injectable } from '@nestjs/common';
import type { SearchMode, SearchQueryDto } from '@amic-vault/shared';
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

type VectorSearchMode = Extract<SearchMode, 'semantic' | 'hybrid'>;

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

  buildFacets(input: SearchQueryDto, scope: SearchSqlFragment): BuiltSearchQuery {
    const filters = this.filterBuilder.build({ filters: input.filters, scope });
    const params = [...filters.params];
    const withSql = this.filteredRowsCte(input, filters.whereSql, params);

    return {
      sql: `
        ${withSql}
        SELECT jsonb_build_object(
          'clients', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', client_id::text, 'count', row_count) ORDER BY row_count DESC, client_id::text)
            FROM (
              SELECT client_id, count(*)::int AS row_count
              FROM filtered
              GROUP BY client_id
            ) client_counts
          ), '[]'::jsonb),
          'matters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', matter_id::text, 'count', row_count) ORDER BY row_count DESC, matter_id::text)
            FROM (
              SELECT matter_id, count(*)::int AS row_count
              FROM filtered
              GROUP BY matter_id
            ) matter_counts
          ), '[]'::jsonb),
          'documentTypes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', document_type, 'count', row_count) ORDER BY row_count DESC, document_type)
            FROM (
              SELECT document_type, count(*)::int AS row_count
              FROM filtered
              GROUP BY document_type
            ) document_type_counts
          ), '[]'::jsonb),
          'versionStatuses', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', version_status, 'count', row_count) ORDER BY row_count DESC, version_status)
            FROM (
              SELECT version_status, count(*)::int AS row_count
              FROM filtered
              GROUP BY version_status
            ) version_status_counts
          ), '[]'::jsonb),
          'dateRanges', jsonb_build_array(
            jsonb_build_object(
              'value', 'last_7_days',
              'label', 'Last 7 days',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at >= now() - interval '7 days')
            ),
            jsonb_build_object(
              'value', 'last_30_days',
              'label', 'Last 30 days',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at >= now() - interval '30 days')
            ),
            jsonb_build_object(
              'value', 'older',
              'label', 'Older',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at < now() - interval '30 days')
            )
          )
        ) AS facets
      `,
      params,
    };
  }

  buildVector(
    input: SearchQueryDto,
    scope: SearchSqlFragment,
    queryVector: string,
    mode: VectorSearchMode,
  ): BuiltSearchQuery {
    const params: SearchSqlValue[] = [];
    const cteSql = this.vectorCandidateCte(input, scope, queryVector, mode, params);
    const pageSize = input.pageSize;
    const offset = (input.page - 1) * pageSize;
    params.push(pageSize);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    return {
      sql: `
        ${cteSql}
        SELECT document_id, version_id, matter_id, client_id,
          title, document_type, version_status, updated_at,
          score::float8 AS score,
          left(chunk_text, 200) AS raw_snippet,
          count(*) OVER()::int AS total
        FROM best
        ORDER BY score DESC, updated_at DESC, version_id
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
      `,
      params,
    };
  }

  buildVectorFacets(
    input: SearchQueryDto,
    scope: SearchSqlFragment,
    queryVector: string,
    mode: VectorSearchMode,
  ): BuiltSearchQuery {
    const params: SearchSqlValue[] = [];
    const cteSql = this.vectorCandidateCte(input, scope, queryVector, mode, params);

    return {
      sql: `
        ${cteSql},
        filtered AS (
          SELECT client_id, matter_id, document_type, version_status, updated_at
          FROM best
        )
        SELECT jsonb_build_object(
          'clients', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', client_id::text, 'count', row_count) ORDER BY row_count DESC, client_id::text)
            FROM (
              SELECT client_id, count(*)::int AS row_count
              FROM filtered
              GROUP BY client_id
            ) client_counts
          ), '[]'::jsonb),
          'matters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', matter_id::text, 'count', row_count) ORDER BY row_count DESC, matter_id::text)
            FROM (
              SELECT matter_id, count(*)::int AS row_count
              FROM filtered
              GROUP BY matter_id
            ) matter_counts
          ), '[]'::jsonb),
          'documentTypes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', document_type, 'count', row_count) ORDER BY row_count DESC, document_type)
            FROM (
              SELECT document_type, count(*)::int AS row_count
              FROM filtered
              GROUP BY document_type
            ) document_type_counts
          ), '[]'::jsonb),
          'versionStatuses', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', version_status, 'count', row_count) ORDER BY row_count DESC, version_status)
            FROM (
              SELECT version_status, count(*)::int AS row_count
              FROM filtered
              GROUP BY version_status
            ) version_status_counts
          ), '[]'::jsonb),
          'dateRanges', jsonb_build_array(
            jsonb_build_object(
              'value', 'last_7_days',
              'label', 'Last 7 days',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at >= now() - interval '7 days')
            ),
            jsonb_build_object(
              'value', 'last_30_days',
              'label', 'Last 30 days',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at >= now() - interval '30 days')
            ),
            jsonb_build_object(
              'value', 'older',
              'label', 'Older',
              'count', (SELECT count(*)::int FROM filtered WHERE updated_at < now() - interval '30 days')
            )
          )
        ) AS facets
      `,
      params,
    };
  }

  private filteredRowsCte(
    input: SearchQueryDto,
    whereSql: string,
    params: SearchSqlValue[],
  ): string {
    if (!input.query) {
      return `
        WITH filtered AS (
          SELECT idx.client_id, idx.matter_id, idx.document_type, idx.version_status, idx.updated_at
          FROM document_search_index idx
          ${whereSql}
        )
      `;
    }

    params.push(input.query);
    const queryParam = `$${params.length}`;
    return `
      WITH tsq AS (
        SELECT websearch_to_tsquery('simple', ${queryParam}) AS query
      ),
      filtered AS (
        SELECT idx.client_id, idx.matter_id, idx.document_type, idx.version_status, idx.updated_at
        FROM document_search_index idx
        CROSS JOIN tsq
        ${whereSql}
          AND (idx.title_tsv @@ tsq.query OR idx.content_tsv @@ tsq.query)
      )
    `;
  }

  private vectorCandidateCte(
    input: SearchQueryDto,
    scope: SearchSqlFragment,
    queryVector: string,
    mode: VectorSearchMode,
    outputParams: SearchSqlValue[],
  ): string {
    if (!input.query) {
      throw new Error('semantic and hybrid search require query');
    }
    const filters = this.filterBuilder.build({ filters: input.filters, scope });
    outputParams.push(...filters.params);
    outputParams.push(queryVector);
    const vectorParam = `$${outputParams.length}`;
    const tsqSql =
      mode === 'hybrid'
        ? (() => {
            outputParams.push(input.query ?? '');
            return `tsq AS (
              SELECT websearch_to_tsquery('simple', $${outputParams.length}) AS query
            ),`;
          })()
        : '';
    const joinTsqSql = mode === 'hybrid' ? 'CROSS JOIN tsq' : '';
    const keywordScoreSql =
      mode === 'hybrid'
        ? `
          CASE
            WHEN idx.title_tsv @@ tsq.query OR idx.content_tsv @@ tsq.query THEN
              ts_rank_cd(
                setweight(idx.title_tsv, 'A') || setweight(idx.content_tsv, 'B'),
                tsq.query
              )::float8
            ELSE 0::float8
          END
        `
        : '0::float8';
    const semanticScoreSql = `(1 - (emb.embedding <=> ${vectorParam}::vector))`;
    const scoreSql =
      mode === 'hybrid'
        ? `((${keywordScoreSql}) * 0.55 + GREATEST(${semanticScoreSql}, 0) * 0.45)`
        : semanticScoreSql;

    return `
      WITH ${tsqSql}
      candidates AS (
        SELECT idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
          idx.title, idx.document_type, idx.version_status, idx.updated_at,
          chunk.chunk_id, chunk.chunk_ordinal, chunk.chunk_text,
          ${keywordScoreSql} AS keyword_score,
          ${semanticScoreSql} AS semantic_score,
          ${scoreSql} AS score
        FROM document_search_index idx
        ${joinTsqSql}
        JOIN documents ai_doc
          ON ai_doc.tenant_id = idx.tenant_id
          AND ai_doc.document_id = idx.document_id
          AND ai_doc.ai_allowed = true
        JOIN document_chunks chunk
          ON chunk.tenant_id = idx.tenant_id
          AND chunk.version_id = idx.version_id
          AND chunk.chunk_kind = 'child'
          AND chunk.stale = false
        JOIN document_chunk_embeddings emb
          ON emb.tenant_id = chunk.tenant_id
          AND emb.chunk_id = chunk.chunk_id
          AND emb.model_route = 'local_gemma'
          AND emb.stale = false
        ${filters.whereSql}
      ),
      ranked AS (
        SELECT *,
          row_number() OVER (
            PARTITION BY version_id
            ORDER BY score DESC, updated_at DESC, chunk_ordinal ASC
          ) AS best_rank
        FROM candidates
      ),
      best AS (
        SELECT document_id, version_id, matter_id, client_id, title, document_type,
          version_status, updated_at, chunk_text, score
        FROM ranked
        WHERE best_rank = 1
      )
    `;
  }
}
