import { Inject, Injectable } from '@nestjs/common';
import type { SearchMode, SearchQueryDto, SearchSort, SearchTarget } from '@amic-vault/shared';
import {
  SearchFilterBuilder,
  searchExtractionStatusSql,
  type SearchSqlFragment,
  type SearchSqlValue,
} from './search-filter.builder';
import { SnippetBuilder } from './snippet-builder';

export interface BuiltSearchQuery {
  sql: string;
  params: SearchSqlValue[];
}

type VectorSearchMode = Extract<SearchMode, 'semantic' | 'hybrid'>;

function targetFor(input: SearchQueryDto): SearchTarget {
  return input.target ?? 'all';
}

function sortFor(input: SearchQueryDto): SearchSort {
  return input.sortBy ?? 'relevance';
}

function keywordMatchSql(target: SearchTarget): string {
  if (target === 'title') return 'idx.title_tsv @@ tsq.query';
  if (target === 'body') return 'idx.content_tsv @@ tsq.query';
  return '(idx.title_tsv @@ tsq.query OR idx.content_tsv @@ tsq.query)';
}

function keywordSnippetSourceSql(target: SearchTarget): string {
  if (target === 'title') return 'idx.title';
  if (target === 'body') return 'idx.content_text';
  return 'CASE WHEN idx.content_tsv @@ tsq.query THEN idx.content_text ELSE idx.title END';
}

function keywordScoreSql(target: SearchTarget): string {
  if (target === 'title') return "ts_rank_cd(setweight(idx.title_tsv, 'A'), tsq.query)::float8";
  if (target === 'body') return "ts_rank_cd(setweight(idx.content_tsv, 'B'), tsq.query)::float8";
  return `
    ts_rank_cd(
      setweight(idx.title_tsv, 'A') || setweight(idx.content_tsv, 'B'),
      tsq.query
    )::float8
  `;
}

function orderBySql(sortBy: SearchSort, hasQuery: boolean): string {
  if (sortBy === 'updated_asc') return 'idx.updated_at ASC, idx.version_id';
  if (sortBy === 'updated_desc') return 'idx.updated_at DESC, idx.version_id';
  if (sortBy === 'title_asc') return 'lower(idx.title) ASC, idx.updated_at DESC, idx.version_id';
  if (sortBy === 'matter_asc') {
    return "lower(coalesce(m.matter_code, m.matter_name, '')) ASC, idx.updated_at DESC, idx.version_id";
  }
  if (sortBy === 'type_asc') return 'idx.document_type ASC, idx.updated_at DESC, idx.version_id';
  return hasQuery ? 'score DESC, idx.updated_at DESC, idx.version_id' : 'idx.updated_at DESC, idx.version_id';
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
      const target = targetFor(input);
      const matchSql = keywordMatchSql(target);
      params.push(input.query);
      const queryParam = `$${params.length}`;
      params.push(pageSize);
      const limitParam = `$${params.length}`;
      params.push(offset);
      const offsetParam = `$${params.length}`;
      const headlineSql = this.snippetBuilder.headlineSql(
        keywordSnippetSourceSql(target),
        'tsq.query',
      );
      const scoreSql = keywordScoreSql(target);
      const orderSql = orderBySql(sortFor(input), true);

      return {
        sql: `
          WITH tsq AS (
            SELECT websearch_to_tsquery('simple', ${queryParam}) AS query
          )
          SELECT idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
            idx.title, m.matter_name, m.matter_code, c.name AS client_name,
            idx.document_type, ${searchExtractionStatusSql} AS extraction_status,
            idx.version_status, idx.updated_at,
            ${scoreSql} AS score,
            ${headlineSql} AS raw_snippet,
            count(*) OVER()::int AS total
          FROM document_search_index idx
          CROSS JOIN tsq
          LEFT JOIN matters m
            ON m.tenant_id = idx.tenant_id
            AND m.matter_id = idx.matter_id
          LEFT JOIN clients c
            ON c.tenant_id = idx.tenant_id
            AND c.client_id = idx.client_id
          ${filters.whereSql}
            AND ${matchSql}
          ORDER BY ${orderSql}
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
    const orderSql = orderBySql(sortFor(input), false);

    return {
      sql: `
        SELECT idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
          idx.title, m.matter_name, m.matter_code, c.name AS client_name,
          idx.document_type, ${searchExtractionStatusSql} AS extraction_status,
          idx.version_status, idx.updated_at,
          0::float8 AS score,
          left(COALESCE(NULLIF(idx.content_text, ''), idx.title), 200) AS raw_snippet,
          count(*) OVER()::int AS total
        FROM document_search_index idx
        LEFT JOIN matters m
          ON m.tenant_id = idx.tenant_id
          AND m.matter_id = idx.matter_id
        LEFT JOIN clients c
          ON c.tenant_id = idx.tenant_id
          AND c.client_id = idx.client_id
        ${filters.whereSql}
        ORDER BY ${orderSql}
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
            SELECT jsonb_agg(
              jsonb_build_object(
                'value', client_id::text,
                'label', client_name,
                'count', row_count,
                'canViewSensitiveRef', false
              )
              ORDER BY row_count DESC, client_name, client_id::text
            )
            FROM (
              SELECT filtered.client_id, nullif(max(c.name), '') AS client_name,
                count(*)::int AS row_count
              FROM filtered
              LEFT JOIN clients c
                ON c.tenant_id = filtered.tenant_id
                AND c.client_id = filtered.client_id
              GROUP BY filtered.client_id
            ) client_counts
          ), '[]'::jsonb),
          'matters', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'value', matter_id::text,
                'label', safe_label,
                'count', row_count,
                'canViewSensitiveRef', false
              )
              ORDER BY row_count DESC, safe_label, matter_id::text
            )
            FROM (
              SELECT
                filtered.matter_id,
                nullif(
                  max(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, ''))),
                  ''
                ) AS safe_label,
                count(*)::int AS row_count
              FROM filtered
              LEFT JOIN matters m
                ON m.tenant_id = filtered.tenant_id
                AND m.matter_id = filtered.matter_id
              GROUP BY filtered.matter_id
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
          'extractionStatuses', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', extraction_status, 'count', row_count) ORDER BY row_count DESC, extraction_status)
            FROM (
              SELECT extraction_status, count(*)::int AS row_count
              FROM filtered
              GROUP BY extraction_status
            ) extraction_status_counts
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
        SELECT best.document_id, best.version_id, best.matter_id, best.client_id,
          best.title, m.matter_name, m.matter_code, c.name AS client_name,
          best.document_type, best.extraction_status, best.version_status, best.updated_at,
          score::float8 AS score,
          left(chunk_text, 200) AS raw_snippet,
          count(*) OVER()::int AS total
        FROM best
        LEFT JOIN matters m
          ON m.tenant_id = best.tenant_id
          AND m.matter_id = best.matter_id
        LEFT JOIN clients c
          ON c.tenant_id = best.tenant_id
          AND c.client_id = best.client_id
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
          SELECT tenant_id, client_id, matter_id, document_type, extraction_status, version_status, updated_at
          FROM best
        )
        SELECT jsonb_build_object(
          'clients', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'value', client_id::text,
                'label', client_name,
                'count', row_count,
                'canViewSensitiveRef', false
              )
              ORDER BY row_count DESC, client_name, client_id::text
            )
            FROM (
              SELECT filtered.client_id, nullif(max(c.name), '') AS client_name,
                count(*)::int AS row_count
              FROM filtered
              LEFT JOIN clients c
                ON c.tenant_id = filtered.tenant_id
                AND c.client_id = filtered.client_id
              GROUP BY filtered.client_id
            ) client_counts
          ), '[]'::jsonb),
          'matters', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'value', matter_id::text,
                'label', safe_label,
                'count', row_count,
                'canViewSensitiveRef', false
              )
              ORDER BY row_count DESC, safe_label, matter_id::text
            )
            FROM (
              SELECT
                filtered.matter_id,
                nullif(
                  max(concat_ws(' · ', nullif(m.matter_code, ''), nullif(m.matter_name, ''))),
                  ''
                ) AS safe_label,
                count(*)::int AS row_count
              FROM filtered
              LEFT JOIN matters m
                ON m.tenant_id = filtered.tenant_id
                AND m.matter_id = filtered.matter_id
              GROUP BY filtered.matter_id
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
          'extractionStatuses', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', extraction_status, 'count', row_count) ORDER BY row_count DESC, extraction_status)
            FROM (
              SELECT extraction_status, count(*)::int AS row_count
              FROM filtered
              GROUP BY extraction_status
            ) extraction_status_counts
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

  buildVectorChunks(
    input: SearchQueryDto,
    scope: SearchSqlFragment,
    queryVector: string,
    mode: VectorSearchMode,
    limit: number,
  ): BuiltSearchQuery {
    const params: SearchSqlValue[] = [];
    const cteSql = this.vectorCandidateCte(input, scope, queryVector, mode, params);
    params.push(limit);
    const limitParam = `$${params.length}`;

    return {
      sql: `
        ${cteSql}
        SELECT document_id, version_id, matter_id, client_id, title, document_type,
          version_status, updated_at, chunk_id, parent_chunk_id, chunk_ordinal,
          token_count, chunk_text, text_hash, source_text_hash, score::float8 AS score
        FROM best
        ORDER BY score DESC, updated_at DESC, version_id, chunk_ordinal
        LIMIT ${limitParam}
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
          SELECT idx.tenant_id, idx.client_id, idx.matter_id, idx.document_type,
            ${searchExtractionStatusSql} AS extraction_status,
            idx.version_status, idx.updated_at
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
        SELECT idx.tenant_id, idx.client_id, idx.matter_id, idx.document_type,
          ${searchExtractionStatusSql} AS extraction_status,
          idx.version_status, idx.updated_at
        FROM document_search_index idx
        CROSS JOIN tsq
        ${whereSql}
          AND ${keywordMatchSql(targetFor(input))}
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
    const target = targetFor(input);
    const matchSql = keywordMatchSql(target);
    const lexicalScoreSql = keywordScoreSql(target);
    const keywordScoreExpression =
      mode === 'hybrid'
        ? `
          CASE
            WHEN ${matchSql} THEN
              ${lexicalScoreSql}
            ELSE 0::float8
          END
        `
      : '0::float8';
    const semanticScoreSql = `(1 - (emb.embedding <=> ${vectorParam}::vector))`;
    const scoreSql =
      mode === 'hybrid'
        ? `((${keywordScoreExpression}) * 0.55 + GREATEST(${semanticScoreSql}, 0) * 0.45)`
        : semanticScoreSql;

    return `
      WITH ${tsqSql}
      candidates AS (
        SELECT idx.tenant_id, idx.document_id, idx.version_id, idx.matter_id, idx.client_id,
          idx.title, idx.document_type, ${searchExtractionStatusSql} AS extraction_status,
          idx.version_status, idx.updated_at,
          chunk.chunk_id, chunk.parent_chunk_id, chunk.chunk_ordinal,
          chunk.token_count, chunk.chunk_text, chunk.text_hash, chunk.source_text_hash,
          ${keywordScoreExpression} AS keyword_score,
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
        SELECT tenant_id, document_id, version_id, matter_id, client_id, title, document_type,
          extraction_status, version_status, updated_at, chunk_id, parent_chunk_id, chunk_ordinal,
          token_count, chunk_text, text_hash, source_text_hash, score
        FROM ranked
        WHERE best_rank = 1
      )
    `;
  }
}
