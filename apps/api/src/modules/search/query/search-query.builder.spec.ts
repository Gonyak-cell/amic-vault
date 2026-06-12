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
    expect(built.sql).toContain('idx.client_id = $3');
    expect(built.sql).toContain('idx.document_type = ANY($4::text[])');
    expect(built.sql).not.toContain('idx.version_status =');
    expect(built.sql).not.toContain(query);
    expect(built.params).toEqual([tenantId, 'deleted', clientId, ['memo'], query]);
  });
});
