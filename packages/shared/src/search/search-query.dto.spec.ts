import { describe, expect, it } from 'vitest';
import {
  createSavedSearchSchema,
  searchFiltersSchema,
  searchQuerySchema,
} from './search-query.dto';

const matterId = '11111111-1111-4111-8111-111111111111';

describe('search query DTO', () => {
  it('accepts metadata filters and defaults pagination', () => {
    expect(
      searchQuerySchema.parse({
        filters: {
          matterId,
          matterCode: 'AMIC-2026',
          clientName: 'AMIC',
          title: 'closing',
          documentType: ['contract', 'memo'],
          dateFrom: '2026-06-12T09:00:00+09:00',
          versionStatus: 'current',
        },
        groupBy: 'matter',
        sortBy: 'updated_desc',
        target: 'body',
      }),
    ).toMatchObject({
      filters: {
        matterId,
        matterCode: 'AMIC-2026',
        clientName: 'AMIC',
        title: 'closing',
        documentType: ['contract', 'memo'],
        dateFrom: '2026-06-12T09:00:00+09:00',
        versionStatus: 'current',
      },
      groupBy: 'matter',
      page: 1,
      pageSize: 25,
      mode: 'keyword',
      sortBy: 'updated_desc',
      target: 'body',
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
    expect(() => searchFiltersSchema.parse({ matterCode: '' })).toThrow();
    expect(() => searchFiltersSchema.parse({ clientName: 'x'.repeat(129) })).toThrow();
    expect(() => searchQuerySchema.parse({ query: 'closing', target: 'metadata' })).toThrow();
    expect(() => searchQuerySchema.parse({ query: 'closing', sortBy: 'random' })).toThrow();
    expect(() =>
      searchFiltersSchema.parse({
        dateFrom: '2026-06-13T00:00:00Z',
        dateTo: '2026-06-12T00:00:00Z',
      }),
    ).toThrow();
  });

  it('validates saved searches without accepting empty queries', () => {
    expect(
      createSavedSearchSchema.parse({
        name: 'Closing searches',
        query: {
          query: 'closing',
          filters: { matterCode: 'AMIC-2026' },
          target: 'body',
        },
      }),
    ).toMatchObject({
      name: 'Closing searches',
      query: {
        query: 'closing',
        target: 'body',
      },
    });
    expect(() =>
      createSavedSearchSchema.parse({
        name: 'No query',
        query: { filters: { matterCode: 'AMIC-2026' } },
      }),
    ).toThrow();
    expect(() =>
      createSavedSearchSchema.parse({
        name: '',
        query: { query: 'closing' },
      }),
    ).toThrow();
  });
});
