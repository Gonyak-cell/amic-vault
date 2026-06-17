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
    const built = builder().build(
      { query: malicious, page: 1, pageSize: 10 },
      scope,
    );

    expect(built.sql).toContain('websearch_to_tsquery');
    expect(built.sql).toContain('LEFT JOIN matters m');
    expect(built.sql).toContain('LEFT JOIN clients c');
    expect(built.sql).not.toContain(malicious);
    expect(built.sql).toContain('idx.document_status <> $2');
    expect(built.sql).toContain('idx.version_status = $3');
    expect(built.params).toContain(malicious);
  });

  it('supports metadata-only search without full-text predicates', () => {
    const built = builder().build(
      {
        filters: { documentType: 'contract', versionStatus: 'all' },
        page: 2,
        pageSize: 5,
      },
      scope,
    );

    expect(built.sql).not.toContain('websearch_to_tsquery');
    expect(built.sql).toContain('idx.document_type = ANY($3::text[])');
    expect(built.sql).not.toContain('idx.version_status =');
    expect(built.params).toEqual([tenantId, 'deleted', ['contract'], 5, 5]);
  });

  it('builds facet aggregation from the same filtered and full-text scoped rows', () => {
    const query = "closing'; DROP TABLE document_search_index; --";
    const clientId = '11111111-1111-4111-8111-111111111155';
    const built = builder().buildFacets(
      {
        query,
        filters: { clientId, documentType: 'memo', versionStatus: 'all' },
        page: 1,
        pageSize: 10,
      },
      scope,
    );

    expect(built.sql).toContain('WITH tsq AS');
    expect(built.sql).toContain('filtered AS');
    expect(built.sql).toContain('FROM filtered');
    expect(built.sql).toContain("'label', client_name");
    expect(built.sql).toContain("'label', safe_label");
    expect(built.sql).toContain('idx.client_id = $3');
    expect(built.sql).toContain('idx.document_type = ANY($4::text[])');
    expect(built.sql).not.toContain('idx.version_status =');
    expect(built.sql).not.toContain(query);
    expect(built.params).toEqual([tenantId, 'deleted', clientId, ['memo'], query]);
  });

  it('builds semantic search from permission-scoped aiAllowed chunk candidates', () => {
    const built = builder().buildVector(
      { query: 'termination', mode: 'semantic', page: 1, pageSize: 10 },
      scope,
      '[0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'semantic',
    );

    expect(built.sql).toContain('JOIN documents ai_doc');
    expect(built.sql).toContain('ai_doc.ai_allowed = true');
    expect(built.sql).toContain('JOIN document_chunks chunk');
    expect(built.sql).toContain('JOIN document_chunk_embeddings emb');
    expect(built.sql).toContain('emb.embedding <=> $4::vector');
    expect(built.sql).toContain('idx.tenant_id = $1');
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
      { query, mode: 'hybrid', page: 1, pageSize: 10 },
      scope,
      '[0.000000,0.100000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000,0.000000]',
      'hybrid',
    );

    expect(built.sql).toContain('websearch_to_tsquery');
    expect(built.sql).toContain('* 0.55');
    expect(built.sql).toContain('* 0.45');
    expect(built.sql).not.toContain(query);
    expect(built.params).toContain(query);
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
