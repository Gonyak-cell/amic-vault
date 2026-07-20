import { describe, expect, it } from 'vitest';
import {
  createSavedSearchSchema,
  searchFiltersSchema,
  searchResultSchema,
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
          ocrConfidence: 'ocr_low_confidence',
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
        ocrConfidence: 'ocr_low_confidence',
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

  it('accepts clause as a bounded keyword search target', () => {
    expect(searchQuerySchema.parse({ query: '손해배상', target: 'clause' })).toMatchObject({
      mode: 'keyword',
      query: '손해배상',
      target: 'clause',
    });
  });

  it('rejects invalid identifiers, unknown document types, and inverted date ranges', () => {
    expect(() => searchFiltersSchema.parse({ matterId: 'not-a-uuid' })).toThrow();
    expect(() => searchFiltersSchema.parse({ documentType: 'MA' })).toThrow();
    expect(() => searchFiltersSchema.parse({ confidentialityLevel: 'secret' })).toThrow();
    expect(() => searchFiltersSchema.parse({ extractionStatus: 'unsearchable' })).toThrow();
    expect(() => searchFiltersSchema.parse({ ocrConfidence: '0.9' })).toThrow();
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
      scope: 'personal',
    });
    expect(
      createSavedSearchSchema.parse({
        matterId: '11111111-1111-4111-8111-111111111901',
        name: 'Matter team searches',
        query: {
          query: 'closing',
          filters: { matterId: '11111111-1111-4111-8111-111111111901' },
        },
        scope: 'matter-team',
      }),
    ).toMatchObject({
      matterId: '11111111-1111-4111-8111-111111111901',
      scope: 'matter-team',
    });
    expect(() =>
      createSavedSearchSchema.parse({
        name: 'No query',
        query: { filters: { matterCode: 'AMIC-2026' } },
      }),
    ).toThrow();
    expect(() =>
      createSavedSearchSchema.parse({
        name: 'Matter team missing matter',
        query: { query: 'closing' },
        scope: 'matter-team',
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

  it('parses extended search result display fields with safe defaults', () => {
    const parsed = searchResultSchema.parse({
      author: {
        userId: '11111111-1111-4111-8111-111111111101',
        displayName: 'Alpha Matter Owner',
      },
      clientId: '11111111-1111-4111-8111-111111111204',
      documentId: '11111111-1111-4111-8111-111111111201',
      documentType: 'contract',
      highlights: [{ anchorId: 'vph-1-0-6', start: 0, end: 6 }],
      matterId: '11111111-1111-4111-8111-111111111203',
      permissionBadges: {
        confidentiality: 'restricted',
        legalHold: 'document_hold',
        privilege: 'privileged',
      },
      score: 0.75,
      snippet: 'termination clause',
      title: 'Closing Memo',
      updatedAt: '2026-06-12T10:00:00.000Z',
      versionId: '11111111-1111-4111-8111-111111111202',
      versionStatus: 'current',
    });

    expect(parsed).toMatchObject({
      aiAllowed: false,
      author: {
        displayName: 'Alpha Matter Owner',
        userId: '11111111-1111-4111-8111-111111111101',
      },
      nextVersionId: null,
      contentTruncated: false,
      permissionBadges: {
        confidentiality: 'restricted',
        legalHold: 'document_hold',
        privilege: 'privileged',
      },
      prevVersionId: null,
    });
    expect(
      searchResultSchema.parse({
        clientId: '11111111-1111-4111-8111-111111111204',
        documentId: '11111111-1111-4111-8111-111111111201',
        documentType: 'memo',
        matterId,
        snippet: '',
        title: 'Minimal result',
        updatedAt: '2026-06-12T10:00:00.000Z',
        versionId: '11111111-1111-4111-8111-111111111202',
        versionStatus: 'current',
      }),
    ).toMatchObject({
      aiAllowed: false,
      author: null,
      contentTruncated: false,
      highlights: [],
      permissionBadges: {
        confidentiality: 'standard',
        legalHold: 'no_hold',
        privilege: 'none',
      },
      score: 0,
    });
    expect(
      searchResultSchema.parse({
        clientId: '11111111-1111-4111-8111-111111111204',
        contentTruncated: true,
        documentId: '11111111-1111-4111-8111-111111111201',
        documentType: 'memo',
        matterId,
        snippet: '',
        title: 'Partial result',
        updatedAt: '2026-06-12T10:00:00.000Z',
        versionId: '11111111-1111-4111-8111-111111111202',
        versionStatus: 'current',
      }).contentTruncated,
    ).toBe(true);
  });

  it('parses clause result metadata without requiring document-body fields', () => {
    expect(
      searchResultSchema.parse({
        clauseId: '11111111-1111-4111-8111-111111111208',
        clauseKind: 'article',
        clauseNumber: '제12조',
        clientId: '11111111-1111-4111-8111-111111111204',
        documentId: '11111111-1111-4111-8111-111111111201',
        documentType: 'contract',
        matterId,
        resultKind: 'clause',
        snippet: '손해배상 책임 한도는 계약금액으로 제한한다.',
        title: 'Clause Agreement',
        updatedAt: '2026-06-12T10:00:00.000Z',
        versionId: '11111111-1111-4111-8111-111111111202',
        versionStatus: 'current',
      }),
    ).toMatchObject({
      clauseId: '11111111-1111-4111-8111-111111111208',
      clauseKind: 'article',
      clauseNumber: '제12조',
      resultKind: 'clause',
    });
  });

  it('parses public authority search results without document permission fields', () => {
    expect(
      searchResultSchema.parse({
        authorityId: '11111111-1111-4111-8111-111111111309',
        citation: '상법 제398조',
        documentType: 'authority',
        externalRef: '001570-398',
        resultKind: 'authority',
        snippet: '상법 제398조 이사 등과 회사 간의 거래',
        sourceType: 'law_statute',
        sourceUrl: 'https://www.law.go.kr/법령/상법/제398조',
        title: '상법',
        updatedAt: '2026-06-12T10:00:00.000Z',
        versionStatus: 'public',
      }),
    ).toMatchObject({
      aiAllowed: false,
      author: null,
      authorityId: '11111111-1111-4111-8111-111111111309',
      citation: '상법 제398조',
      contentTruncated: false,
      documentType: 'authority',
      highlights: [],
      permissionBadges: {
        confidentiality: 'standard',
        legalHold: 'no_hold',
        privilege: 'none',
      },
      resultKind: 'authority',
      sourceType: 'law_statute',
    });
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
      ocrLowConfidenceCount: 1,
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
