import { describe, expect, it } from 'vitest';
import type { SearchFiltersDto } from '@amic-vault/shared';
import { SearchFilterBuilder, denyAllSearchScope } from './search-filter.builder';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const clientId = '11111111-1111-4111-8111-111111111133';

function tenantScope(value = tenantId) {
  return { sql: 'idx.tenant_id = ?', params: [value] };
}

describe('SearchFilterBuilder', () => {
  it('defaults to deny-all scope, deleted exclusion, and current versions', () => {
    const built = new SearchFilterBuilder().build();

    expect(built.whereSql).toContain('(FALSE)');
    expect(built.whereSql).toContain('idx.document_status <> $1');
    expect(built.whereSql).toContain('idx.version_status = $2');
    expect(built.params).toEqual(['deleted', 'current']);
  });

  it('AND-combines scope and metadata filters with bound parameters', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: {
        matterId,
        clientId,
        documentType: ['contract', 'memo'],
        dateFrom: '2026-06-12T09:00:00+09:00',
        dateTo: '2026-06-12T10:00:00+09:00',
      },
    });

    expect(built.whereSql).toBe(
      [
        'WHERE (idx.tenant_id = $1)',
        '  AND (idx.document_status <> $2)',
        '  AND (idx.version_status = $3)',
        '  AND (idx.matter_id = $4)',
        '  AND (idx.client_id = $5)',
        '  AND (idx.document_type = ANY($6::text[]))',
        '  AND (idx.updated_at >= $7)',
        '  AND (idx.updated_at <= $8)',
      ].join('\n'),
    );
    expect(built.params.slice(0, 6)).toEqual([
      tenantId,
      'deleted',
      'current',
      matterId,
      clientId,
      ['contract', 'memo'],
    ]);
    expect(built.params[6]).toEqual(new Date('2026-06-12T00:00:00.000Z'));
    expect(built.params[7]).toEqual(new Date('2026-06-12T01:00:00.000Z'));
  });

  it('binds malicious scope input without interpolating it into SQL', () => {
    const malicious = "'; DROP TABLE document_search_index; --";
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(malicious),
      filters: { versionStatus: 'all' },
    });

    expect(built.whereSql).not.toContain(malicious);
    expect(built.params).toContain(malicious);
  });

  it('rejects invalid filters before SQL construction', () => {
    expect(() =>
      new SearchFilterBuilder().build({
        scope: tenantScope(),
        filters: { matterId: 'not-a-uuid' },
      }),
    ).toThrow();
    expect(() =>
      new SearchFilterBuilder().build({
        scope: tenantScope(),
        filters: { documentType: 'MA' } as unknown as SearchFiltersDto,
      }),
    ).toThrow();
    expect(() =>
      new SearchFilterBuilder().build({
        scope: tenantScope(),
        filters: {
          dateFrom: '2026-06-13T00:00:00Z',
          dateTo: '2026-06-12T00:00:00Z',
        },
      }),
    ).toThrow();
  });

  it('keeps explicit all-version requests inside the same scope', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: { versionStatus: 'all' },
    });

    expect(built.whereSql).not.toContain('idx.version_status');
    expect(built.whereSql).toContain('idx.tenant_id = $1');
    expect(built.whereSql).toContain('idx.document_status <> $2');
    expect(built.params).toEqual([tenantId, 'deleted']);
    expect(denyAllSearchScope.sql).toBe('FALSE');
  });
});
