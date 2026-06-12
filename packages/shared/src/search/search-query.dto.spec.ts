import { describe, expect, it } from 'vitest';
import { searchFiltersSchema, searchQuerySchema } from './search-query.dto';

const matterId = '11111111-1111-4111-8111-111111111111';

describe('search query DTO', () => {
  it('accepts metadata filters and defaults pagination', () => {
    expect(
      searchQuerySchema.parse({
        filters: {
          matterId,
          documentType: ['contract', 'memo'],
          dateFrom: '2026-06-12T09:00:00+09:00',
          versionStatus: 'current',
        },
      }),
    ).toMatchObject({
      filters: {
        matterId,
        documentType: ['contract', 'memo'],
        dateFrom: '2026-06-12T09:00:00+09:00',
        versionStatus: 'current',
      },
      page: 1,
      pageSize: 25,
      mode: 'keyword',
    });
  });

  it('requires query text for semantic and hybrid retrieval modes', () => {
    expect(() => searchQuerySchema.parse({ mode: 'semantic' })).toThrow();
    expect(searchQuerySchema.parse({ mode: 'hybrid', query: 'termination' })).toMatchObject({
      mode: 'hybrid',
      query: 'termination',
    });
  });

  it('rejects invalid identifiers, unknown document types, and inverted date ranges', () => {
    expect(() => searchFiltersSchema.parse({ matterId: 'not-a-uuid' })).toThrow();
    expect(() => searchFiltersSchema.parse({ documentType: 'MA' })).toThrow();
    expect(() =>
      searchFiltersSchema.parse({
        dateFrom: '2026-06-13T00:00:00Z',
        dateTo: '2026-06-12T00:00:00Z',
      }),
    ).toThrow();
  });
});
