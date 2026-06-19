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
        clientName: 'AMIC',
        documentType: ['contract', 'memo'],
        matterCode: 'AMIC-2026',
        matterName: 'Vault',
        title: 'Closing',
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
        "  AND (idx.title ILIKE $6 ESCAPE '\\')",
        '  AND (\n          EXISTS (',
        '            SELECT 1',
        '            FROM matters matter_filter',
        '            WHERE matter_filter.tenant_id = idx.tenant_id',
        '              AND matter_filter.matter_id = idx.matter_id',
        "              AND matter_filter.matter_code ILIKE $7 ESCAPE '\\'",
        '          )',
        '        )',
        '  AND (\n          EXISTS (',
        '            SELECT 1',
        '            FROM matters matter_filter',
        '            WHERE matter_filter.tenant_id = idx.tenant_id',
        '              AND matter_filter.matter_id = idx.matter_id',
        "              AND matter_filter.matter_name ILIKE $8 ESCAPE '\\'",
        '          )',
        '        )',
        '  AND (\n          EXISTS (',
        '            SELECT 1',
        '            FROM clients client_filter',
        '            WHERE client_filter.tenant_id = idx.tenant_id',
        '              AND client_filter.client_id = idx.client_id',
        "              AND client_filter.name ILIKE $9 ESCAPE '\\'",
        '          )',
        '        )',
        '  AND (idx.document_type = ANY($10::text[]))',
        '  AND (idx.updated_at >= $11)',
        '  AND (idx.updated_at <= $12)',
      ].join('\n'),
    );
    expect(built.params.slice(0, 10)).toEqual([
      tenantId,
      'deleted',
      'current',
      matterId,
      clientId,
      '%Closing%',
      '%AMIC-2026%',
      '%Vault%',
      '%AMIC%',
      ['contract', 'memo'],
    ]);
    expect(built.params[10]).toEqual(new Date('2026-06-12T00:00:00.000Z'));
    expect(built.params[11]).toEqual(new Date('2026-06-12T01:00:00.000Z'));
  });

  it('escapes wildcard characters in text filters', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: { clientName: 'A%_\\B' },
    });

    expect(built.whereSql).toContain("client_filter.name ILIKE $4 ESCAPE '\\'");
    expect(built.params).toContain('%A\\%\\_\\\\B%');
  });

  it('filters extraction and OCR status with a bound status code', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: { extractionStatus: 'ocr_pending' },
    });

    expect(built.whereSql).toContain('FROM canonical_documents cd');
    expect(built.whereSql).toContain('cd.version_id = idx.version_id');
    expect(built.whereSql).toContain("), 'pending')");
    expect(built.params).toEqual([tenantId, 'deleted', 'current', 'ocr_pending']);
  });

  it('filters legal hold and records status through approved state columns', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: {
        legalHold: 'matter_hold',
        recordsStatus: 'archived',
      },
    });

    expect(built.whereSql).toContain('FROM matters matter_hold_filter');
    expect(built.whereSql).toContain('matter_hold_filter.legal_hold = true');
    expect(built.whereSql).toContain('idx.document_status = $4');
    expect(built.params).toEqual([tenantId, 'deleted', 'current', 'archived']);
  });

  it('filters documents without active hold without exposing hold identifiers', () => {
    const built = new SearchFilterBuilder().build({
      scope: tenantScope(),
      filters: { legalHold: 'no_hold', recordsStatus: 'active' },
    });

    expect(built.whereSql).toContain('NOT (');
    expect(built.whereSql).toContain('FROM documents document_hold_filter');
    expect(built.whereSql).toContain('FROM matters matter_hold_filter');
    expect(built.whereSql).toContain("idx.document_status NOT IN ('archived', 'disposal_locked')");
    expect(built.params).toEqual([tenantId, 'deleted', 'current']);
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
