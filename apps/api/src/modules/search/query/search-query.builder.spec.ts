import { describe, expect, it } from 'vitest';
import { SearchFilterBuilder } from './search-filter.builder';
import { SearchQueryBuilder } from './search-query.builder';
import { SnippetBuilder } from './snippet-builder';

const tenantId = '11111111-1111-4111-8111-111111111111';
const scope = { sql: 'idx.tenant_id = ?', params: [tenantId] };

function builder(): SearchQueryBuilder {
  return new SearchQueryBuilder(new SearchFilterBuilder(), new SnippetBuilder());
}

describe('SearchQueryBuilder', () => {
  it('uses websearch_to_tsquery with a bound query parameter', () => {
    const malicious = "termination'; DROP TABLE document_search_index; --";
    const built = builder().build({ query: malicious, page: 1, pageSize: 10 }, scope);

    expect(built.sql).toContain('websearch_to_tsquery');
    expect(built.sql).toContain('amic_korean_search_normalize');
    expect(built.sql).toContain('LEFT JOIN matters m');
    expect(built.sql).toContain('LEFT JOIN clients c');
    expect(built.sql).toContain('LEFT JOIN users author');
    expect(built.sql).toContain('idx.author_user_id');
    expect(built.sql).toContain('idx.ai_allowed');
    expect(built.sql).toContain('idx.content_truncated');
    expect(built.sql).toContain('idx.prev_version_id');
    expect(built.sql).toContain('idx.next_version_id');
    expect(built.sql).toContain('AS confidentiality_level');
    expect(built.sql).toContain('AS legal_hold');
    expect(built.sql).toContain('AS privilege_status');
    expect(built.sql).not.toContain('count(*) OVER()');
    expect(built.sql).toContain('LIMIT $5');
    expect(built.sql).not.toContain(malicious);
    expect(built.sql).toContain('idx.document_status <> $2');
    expect(built.sql).toContain('idx.version_status = $3');
    expect(built.params).toContain(malicious);
  });

  it('limits keyword matching to title or body scope and applies safe sort SQL', () => {
    const titleBuilt = builder().build(
      {
        query: 'closing',
        page: 1,
        pageSize: 10,
        sortBy: 'title_asc',
        target: 'title',
      },
      scope,
    );
    const bodyBuilt = builder().build(
      {
        query: 'closing',
        page: 1,
        pageSize: 10,
        sortBy: 'updated_asc',
        target: 'body',
      },
      scope,
    );

    expect(titleBuilt.sql).toContain('idx.title_tsv @@ tsq.query');
    expect(titleBuilt.sql).not.toContain('body_hit.chunk_id IS NOT NULL');
    expect(titleBuilt.sql).toContain('ORDER BY lower(title) ASC');
    expect(bodyBuilt.sql).toContain('LEFT JOIN LATERAL');
    expect(bodyBuilt.sql).toContain('FROM document_chunks chunk');
    expect(bodyBuilt.sql).toContain("chunk.chunk_kind = 'child'");
    expect(bodyBuilt.sql).toContain('chunk.stale = false');
    expect(bodyBuilt.sql).toContain('body_hit.chunk_id IS NOT NULL');
    expect(bodyBuilt.sql).not.toContain('idx.content_tsv @@ tsq.query');
    expect(bodyBuilt.sql).toContain('ORDER BY updated_at ASC');
  });

  it('treats email target as title plus body search scoped to email documents', () => {
    const built = builder().build(
      {
        query: 'filing request',
        page: 1,
        pageSize: 10,
        target: 'email',
      },
      scope,
    );

    expect(built.sql).toContain("idx.document_type = 'email'");
    expect(built.sql).toContain('(idx.title_tsv @@ tsq.query OR');
    expect(built.sql).toContain('body_hit.chunk_id IS NOT NULL');
  });

  it('routes clause target through clause chunks while keeping document permission scope', () => {
    const query = "손해배상'; DROP TABLE contract_clause_chunks; --";
    const built = builder().build(
      {
        query,
        page: 1,
        pageSize: 10,
        target: 'clause',
      },
      scope,
    );

    expect(built.sql).toContain('JOIN contract_clause_chunks clause_chunk');
    expect(built.sql).toContain('JOIN contract_clauses clause');
    expect(built.sql).toContain('clause_chunk.chunk_search_tsv @@ tsq.query');
    expect(built.sql).toContain('amic_korean_search_normalize(clause_chunk.chunk_text)');
    expect(built.sql).toContain("'clause'::text AS result_kind");
    expect(built.sql).toContain('clause.clause_kind');
    expect(built.sql).toContain('idx.tenant_id = $1');
    expect(built.sql).not.toContain(query);
    expect(built.params).toContain(query);
  });

  it('adds Korean normalized matching without interpolating the query text', () => {
    const query = "손해배상을'; SELECT raw FROM documents; --";
    const built = builder().build({ query, page: 1, pageSize: 10, target: 'body' }, scope);

    expect(built.sql).toContain('amic_korean_search_normalize(chunk.chunk_text)');
    expect(built.sql).toContain("tsq.normalized_query !~ '^[가-힣]+$'");
    expect(built.sql).toContain("chunk.chunk_text ~ ('(^|[^가-힣])' || tsq.normalized_query");
    expect(built.sql).not.toContain(query);
    expect(built.params).toContain(query);
  });

  it('supports metadata-only search without full-text predicates', () => {
    const built = builder().build(
      {
        filters: { documentType: 'contract', versionStatus: 'all' },
        sortBy: 'matter_asc',
        page: 2,
        pageSize: 5,
      },
      scope,
    );

    expect(built.sql).not.toContain('websearch_to_tsquery');
    expect(built.sql).toContain('idx.document_type = ANY($3::text[])');
    expect(built.sql).not.toContain('idx.version_status =');
    expect(built.sql).toContain("ORDER BY lower(coalesce(matter_code, matter_name, '')) ASC");
    expect(built.sql).not.toContain('count(*) OVER()');
    expect(built.params).toEqual([tenantId, 'deleted', ['contract'], 101, 5]);
  });

  it('builds facet aggregation from the same filtered and full-text scoped rows', () => {
    const query = "closing'; DROP TABLE document_search_index; --";
    const clientId = '11111111-1111-4111-8111-111111111155';
    const built = builder().buildFacets(
      {
        query,
        filters: {
          clientId,
          clientName: 'AMIC',
          confidentialityLevel: 'restricted',
          documentType: 'memo',
          legalHold: 'document_hold',
          matterCode: 'AMIC-2026',
          recordsStatus: 'archived',
          title: 'closing',
          privilegeStatus: 'privileged',
          versionStatus: 'all',
        },
        page: 1,
        pageSize: 10,
        target: 'title',
      },
      scope,
    );

    expect(built.sql).toContain('WITH tsq AS');
    expect(built.sql).toContain('normalized_query');
    expect(built.sql).toContain('filtered AS');
    expect(built.sql).toContain('FROM filtered');
    expect(built.sql).toContain("'label', client_name");
    expect(built.sql).toContain("'label', safe_label");
    expect(built.sql).toContain("'confidentialityLevels'");
    expect(built.sql).toContain("'extractionStatuses'");
    expect(built.sql).toContain("'emailSenderDomains'");
    expect(built.sql).toContain("'emailRecipientDomains'");
    expect(built.sql).toContain("'ocrConfidence'");
    expect(built.sql).toContain("'legalHolds'");
    expect(built.sql).toContain("'privilegeStatuses'");
    expect(built.sql).toContain("'recordsStatuses'");
    expect(built.sql).toContain('idx.client_id = $3');
    expect(built.sql).toContain('idx.title ILIKE $4');
    expect(built.sql).toContain('matter_filter.matter_code ILIKE $5');
    expect(built.sql).toContain('client_filter.name ILIKE $6');
    expect(built.sql).toContain('idx.document_type = ANY($7::text[])');
    expect(built.sql).toContain('FROM documents confidentiality_doc');
    expect(built.sql).toContain('FROM documents document_hold_filter');
    expect(built.sql).toContain('FROM documents privilege_doc');
    expect(built.sql).toContain('idx.document_status = $9');
    expect(built.sql).toContain('idx.title_tsv @@ tsq.query');
    expect(built.sql).not.toContain('idx.version_status =');
    expect(built.sql).not.toContain(query);
    expect(built.params).toEqual([
      tenantId,
      'deleted',
      clientId,
      '%closing%',
      '%AMIC-2026%',
      '%AMIC%',
      ['memo'],
      'restricted',
      'archived',
      'privileged',
      query,
    ]);
  });

  it('builds semantic search from permission-scoped chunk candidates', () => {
    const built = builder().buildVector(
      { query: 'termination', mode: 'semantic', page: 1, pageSize: 10 },
      scope,
      '[0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'semantic',
    );

    expect(built.sql).not.toContain('ai_doc.ai_allowed = true');
    expect(built.sql).toContain('JOIN document_chunks chunk');
    expect(built.sql).toContain('JOIN document_chunk_embeddings emb');
    expect(built.sql).toContain("emb.model_route = 'bge_m3'");
    expect(built.sql).toContain('emb.embedding <=> $4::vector');
    expect(built.sql).toContain('idx.tenant_id = $1');
    expect(built.sql).not.toContain('count(*) OVER()');
    expect(built.sql).toContain('LIMIT $5');
    expect(built.params.slice(0, 4)).toEqual([
      tenantId,
      'deleted',
      'current',
      '[0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
    ]);
  });

  it('combines keyword and vector scores deterministically for hybrid search', () => {
    const query = "closing'; DROP TABLE document_chunks; --";
    const built = builder().buildVector(
      { query, mode: 'hybrid', page: 1, pageSize: 10, target: 'body' },
      scope,
      '[0.000000,0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'hybrid',
    );

    expect(built.sql).toContain('websearch_to_tsquery');
    expect(built.sql).toContain('amic_korean_search_normalize');
    expect(built.sql).toContain("chunk.chunk_kind = 'child'");
    expect(built.sql).toContain('to_tsvector(\'simple\', chunk.chunk_text) @@ tsq.query');
    expect(built.sql).not.toContain('idx.content_tsv @@ tsq.query');
    expect(built.sql).not.toContain('function keywordScoreSql');
    expect(built.sql).toContain('* 0.55');
    expect(built.sql).toContain('* 0.45');
    expect(built.sql).not.toContain(query);
    expect(built.params).toContain(query);
  });

  it('keeps tenant ids available for semantic facet display labels', () => {
    const built = builder().buildVectorFacets(
      { query: 'termination', mode: 'semantic', page: 1, pageSize: 10 },
      scope,
      '[0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'semantic',
    );

    expect(built.sql).toContain(
      'SELECT tenant_id, document_id, client_id, matter_id, document_type',
    );
    expect(built.sql).toContain('confidentiality_level');
    expect(built.sql).toContain('legal_hold, privilege_status, records_status');
    expect(built.sql).toContain('c.tenant_id = filtered.tenant_id');
    expect(built.sql).toContain('m.tenant_id = filtered.tenant_id');
    expect(built.sql).toContain("'label', client_name");
    expect(built.sql).toContain("'label', safe_label");
    expect(built.sql).toContain("'confidentialityLevels'");
    expect(built.sql).toContain("'extractionStatuses'");
    expect(built.sql).toContain("'emailSenderDomains'");
    expect(built.sql).toContain("'emailRecipientDomains'");
    expect(built.sql).toContain("'ocrConfidence'");
    expect(built.sql).toContain("'legalHolds'");
    expect(built.sql).toContain("'privilegeStatuses'");
    expect(built.sql).toContain("'recordsStatuses'");
  });

  it('builds bounded AI context chunk candidates from the same vector CTE', () => {
    const built = builder().buildVectorChunks(
      { query: 'termination', mode: 'hybrid', page: 1, pageSize: 10 },
      scope,
      '[0.000000,0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'hybrid',
      6,
    );

    expect(built.sql).toContain('chunk_id');
    expect(built.sql).toContain('token_count');
    expect(built.sql).toContain('source_text_hash');
    expect(built.sql).toContain('LIMIT $6');
    expect(built.params.at(-1)).toBe(6);
  });
});
