import { describe, expect, it } from 'vitest';
import {
  createSavedSearchSchema,
  searchFiltersSchema,
  searchPrivacySettingsSchema,
  searchQuerySchema,
} from './search-query.dto';
import { searchAdminHealthSchema } from './search-admin.dto';

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
          confidentialityLevel: 'restricted',
          documentType: ['contract', 'memo'],
          extractionStatus: 'ocr_pending',
          legalHold: 'document_hold',
          privilegeStatus: 'privileged',
          recordsStatus: 'archived',
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
        confidentialityLevel: 'restricted',
        documentType: ['contract', 'memo'],
        extractionStatus: 'ocr_pending',
        legalHold: 'document_hold',
        privilegeStatus: 'privileged',
        recordsStatus: 'archived',
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
    expect(() => searchFiltersSchema.parse({ confidentialityLevel: 'secret' })).toThrow();
    expect(() => searchFiltersSchema.parse({ extractionStatus: 'unsearchable' })).toThrow();
    expect(() => searchFiltersSchema.parse({ legalHold: 'hold-id-123' })).toThrow();
    expect(() => searchFiltersSchema.parse({ privilegeStatus: 'attorney_eyes_only' })).toThrow();
    expect(() => searchFiltersSchema.parse({ recordsStatus: 'deleted' })).toThrow();
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
          filters: { matterCode: 'AMIC-2026', legalHold: 'matter_hold' },
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

  it('normalizes search URL privacy settings without allowing mixed private/plaintext mode', () => {
    expect(searchPrivacySettingsSchema.parse({})).toEqual({
      allowPlaintextReusableUrls: true,
      urlMode: 'plaintext_url',
    });
    expect(searchPrivacySettingsSchema.parse({ urlMode: 'private_saved_ref' })).toEqual({
      allowPlaintextReusableUrls: false,
      urlMode: 'private_saved_ref',
    });
    expect(() =>
      searchPrivacySettingsSchema.parse({
        allowPlaintextReusableUrls: true,
        urlMode: 'private_saved_ref',
      }),
    ).toThrow();
  });
});

describe('search admin health DTO', () => {
  it('accepts bounded operational search health without raw query or source fields', () => {
    const parsed = searchAdminHealthSchema.parse({
      currentVersionCount: 4,
      indexedVersionCount: 3,
      missingIndexCount: 1,
      staleIndexCount: 1,
      extractionReadyCount: 2,
      extractionPendingCount: 1,
      ocrPendingCount: 1,
      extractionFailedCount: 0,
      staleChunkCount: 2,
      staleEmbeddingCount: 3,
      queryAuditCount24h: 12,
      noResultQueryCount24h: 2,
      p95DurationMs24h: 240,
      noResultQueries: [
        {
          category: 'keyword',
          count: 2,
          lastSeenAt: '2026-06-19T15:00:00.000Z',
          queryHash: 'a'.repeat(64),
        },
      ],
    });

    expect(JSON.stringify(parsed)).not.toMatch(/raw|source|snippet|bodyText|prompt|response/i);
    expect(() =>
      searchAdminHealthSchema.parse({
        ...parsed,
        noResultQueries: [{ ...parsed.noResultQueries[0], queryHash: 'not-a-hash' }],
      }),
    ).toThrow();
  });
});
